# ربط الـ EC2 (13.49.223.91) بالـ RDS

> **المشكلة:** الـ Frontend شغال على EC2 في **Public Subnet**، والـ RDS في **Private Subnet**.
> الـ EC2 الجديد ده مش عنده وصول لـ `10.0.1.202` لحد ما نوصلهم ببعض.

---

## أول حاجة: الـ EC2 ده في أنهي VPC؟

```bash
# على الـ EC2
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 300")

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/availability-zone

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/network/interfaces/macs/
```

ثم من الـ Console (أو AWS CLI) شوف الـ `VpcId` بتاع الـ subnet:

```bash
aws ec2 describe-instances --instance-ids <instance-id> \
  --query 'Reservations[0].Instances[0].{subnet:SubnetId,vpc:VpcId,privateIp:PrivateIpAddress,publicIp:PublicIpAddress}'
```

---

## الحالة أ — نفس الـ VPC (الأرجح)

الـ EC2 في Public Subnet والـ RDS في Private Subnet، **نفس الـ VPC** → الحل 3 خطوات:

### 1) عدّل الـ Security Group بتاع الـ RDS

الـ RDS عنده SG منفصل (مش `CloudGuard-EC2-SG`). لازم يسمح للـ EC2:

```bash
# 1) هات SG بتاع الـ RDS
aws rds describe-db-instances --db-instance-identifier cloudguard-db1 \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text

# 2) هات SG والـ private IP بتاع الـ EC2
aws ec2 describe-instances --instance-ids <instance-id> \
  --query 'Reservations[0].Instances[0].{sg:SecurityGroups[0].GroupId,ip:PrivateIpAddress}'

# 3) اسمح للـ EC2 يدخل على 5432
aws ec2 authorize-security-group-ingress \
  --group-id <RDS_SG_ID> \
  --protocol tcp --port 5432 \
  --source-group <EC2_SG_ID> \
  --region eu-north-1
```

> **الأفضل:** `--source-group` بدل `--cidr`. كده أي instance في الـ SG ده يقدر
> يدخل، ومش بنفتح الـ subnet كله.

### 2) تأكد إن الـ Route Table بيسمح بالاتصال الداخلي

الاتصال داخل نفس الـ VPC **مش بيحتاج** NAT Gateway — الـ local route موجود تلقائياً.
اختبر:

```bash
# من الـ EC2
nc -zv 10.0.1.202 5432
# أو
timeout 5 bash -c '</dev/tcp/10.0.1.202/5432' && echo "OK" || echo "BLOCKED"
```

لو `OK` → **خلصت، مفيش tunnel مطلوب**.

### 3) خلّي `.env` على الـ EC2 يشاور على الـ Private IP

```env
# Backend/.env على الـ EC2 — مختلف عن ملفك المحلي
DATABASE_URL="postgresql://postgres:PASSWORD@10.0.1.202:5432/postgres?sslmode=require"
```

> على الـ EC2 استخدم **`10.0.1.202`** مش `127.0.0.1`.
> وعلى لابتوبك استخدم `127.0.0.1` + SSH Tunnel.

والـ `Backend/src/db/index.ts` بيتعامل صح في الحالتين:

```ts
const isLocal = /(^|@)(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(connectionString);
ssl: isLocal ? false : "require"   // 10.0.1.202 → SSL مطلوب ✅
```

---

## الحالة ب — VPC تاني

الـ RDS في `10.0.1.202` والـ EC2 في VPC مختلف → الاتصال الداخلي مش ممكن.

### الخيار ب1 — VPC Peering (الأنضف، مجاني)

1. **VPC → Peering connections → Create**
   - Requester: VPC الـ EC2 · Accepter: VPC الـ RDS (نفس الحساب = تلقائي)
2. **عدّل Route Tables في الاتجاهين:**
   - Route table بتاع الـ EC2 subnet: `<RDS_VPC_CIDR>` → `pcx-xxxx`
   - Route table بتاع الـ RDS subnet: `<EC2_VPC_CIDR>` → `pcx-xxxx`
3. **الـ Security Groups:** اسمح من CIDR الـ VPC التاني (مش SG reference — الـ SG referencing مش بيشتغل عبر peering)

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <RDS_SG_ID> --protocol tcp --port 5432 \
  --cidr <EC2_VPC_CIDR> --region eu-north-1
```

### الخيار ب2 — SSH Tunnel على الـ EC2 (من غير أي تغيير في VPC)

الـ EC2 يبقى هو الـ Bastion — بيفتح tunnel محلي لـ RDS:

```bash
# على الـ EC2 — اختبار سريع
ssh -i ~/cloudguard-bastion-key.pem -N -f \
    -L 5432:cloudguard-db1.c7uy2kk4edth.eu-north-1.rds.amazonaws.com:5432 \
    ec2-user@13.48.2.127

# ثم
psql -h 127.0.0.1 -U postgres -d postgres -c "select 1"
```

للتشغيل الدائم، systemd unit:

```ini
# /etc/systemd/system/cloudguard-tunnel.service
[Unit]
Description=SSH Tunnel to CloudGuard RDS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/bin/ssh -i /home/ubuntu/.ssh/cloudguard-bastion-key.pem \
    -N -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -L 5432:cloudguard-db1.c7uy2kk4edth.eu-north-1.rds.amazonaws.com:5432 \
    ec2-user@13.48.2.127
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now cloudguard-tunnel
sudo journalctl -u cloudguard-tunnel -f
```

والـ `.env`:
```env
DATABASE_URL="postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres"
```

> ⚠️ كده الـ RDS الـ SG بتاعه لازم يسمح للـ `CloudGuard-Bastion-1A` بس (اللي هو أصلاً مسموح).
> الـ EC2 الجديد بيتكلم مع الـ Bastion على 22 — تأكد إن الـ `CloudGuard-EC2-SG`
> بيسمح لـ IP الـ EC2 الجديد على 22.

### الخيار ب3 — نقل الـ EC2 الجديد لنفس الـ VPC

अصعب وأغلى (بيحتاج recreate). مش منصوح بيه دلوقتي.

---

## التحقق النهائي

```bash
# على الـ EC2
cd ~/CloudGuard-IoT/Backend
npm run db:check
```

المتوقع:
```
✔ الاتصال ناجح — 12ms
   server time : 2026-11-27T...
   engine      : PostgreSQL 16.x
   8/8 جداول ✔
```

بعد كده:

```bash
curl http://127.0.0.1:3000/api/v1/health
curl http://13.49.223.91/api/v1/health      # من بره
```

---

## التكلفة

| الخيار | التكلفة |
|---|---|
| نفس الـ VPC + SG rule | **0$** |
| VPC Peering | **0$** (داخل نفس الـ region) |
| SSH Tunnel على الـ EC2 | **0$** |
| NAT Gateway (لو اتحط في الـ Private Subnet) | 🔴 **~32$/شهر** — متعملهوش |

> 🔴 **متحطش الـ RDS في subnet فيه NAT Gateway.** الـ RDS نفسه مش بيحتاج إنترنت
> خروج. والـ NAT أغلى بند في الفاتورة.
