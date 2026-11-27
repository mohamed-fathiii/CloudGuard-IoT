#!/usr/bin/env bash
# ================================================================
#  deploy.sh — تحديث النشر على EC2 بعد git push
# ================================================================
#  التشغيل على الـ EC2:
#     cd ~/CloudGuard-IoT && bash Backend/deploy/deploy.sh
#
#  السكربت بيعمل: سحب → تسطيب → بناء → إعادة تشغيل → فحص صحة
#  لو أي خطوة فشلت بيقف (set -e) ومايكملش للي بعدها.
# ================================================================

set -euo pipefail

# ── حماية: متفشلش بسبب انقطاع SSH لو شغّلته من جوه جلسة ──
#     لو شغّلته من الـ Console (Session Manager) الأمر ده مالوش لازمة.
if [ -t 0 ] && [ -z "${CLOUDGUARD_NO_NOHUP:-}" ]; then
  export CLOUDGUARD_NO_NOHUP=1
fi

REPO_DIR="${REPO_DIR:-$HOME/CloudGuard-IoT}"
BRANCH="${BRANCH:-main}"

cyan() { printf '\e[36m%s\e[0m\n' "$*"; }
green() { printf '\e[32m%s\e[0m\n' "$*"; }
red() { printf '\e[31m%s\e[0m\n' "$*"; }

cyan "==> 1/6  سحب آخر نسخة من $BRANCH"
cd "$REPO_DIR"
git fetch --prune origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# ── الحماية: نتأكد إن مفيش أسرار هتتبني ──
if [ -f Backend/.env ]; then
  green "     ✔ Backend/.env موجود"
else
  red "     ✖ Backend/.env مش موجود — اعمل: cp Backend/.env.example Backend/.env واملأ DATABASE_URL"
  exit 1
fi

cyan "==> 2/6  بناء الـ Backend (M2)"
cd "$REPO_DIR/Backend"
# dev كمان — الـ build محتاج typescript + @types
npm install --include=dev
npm run build

cyan "==> 3/6  فحص الـ schema على RDS"
if npm run db:check; then
  green "     ✔ الداتابيز متصلة والـ schema مطابق"
else
  red "     ✖ فحص الداتابيز فشل."
  red "       • لو ECONNREFUSED/ETIMEDOUT: الـ SSH Tunnel مش شغال على السيرفر"
  red "       • التفاصيل: Backend/docs/DEPLOY-EC2.md"
  exit 1
fi

cyan "==> 4/6  بناء الـ Frontend"
cd "$REPO_DIR/Frontend"
npm ci 2>/dev/null || npm install
npm run build

cyan "==> 5/6  إعادة تشغيل الخدمتين"
# ⚠️ لو شغّلت ده من جلسة SSH عادية، الـ restart بتاع الـ Frontend ممكن
#    يقطع الجلسة وميوصلكش نتيجة. الأسلم: شغّله من Session Manager
#    أو من `screen`/`tmux`. الـ API آمن لأنه على 127.0.0.1.
sudo systemctl restart cloudguard-api
# الـ Frontend مش بنعيد تشغيله تلقائياً — بعدين بقرار منك:
#   sudo systemctl restart cloudguard-frontend
sleep 4

cyan "==> 6/6  فحص الصحة"
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/v1/health || echo "000")
FE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/login || echo "000")

echo "     API    → HTTP $API_STATUS"
echo "     Front  → HTTP $FE_STATUS"

if [ "$API_STATUS" = "200" ] && [ "$FE_STATUS" = "200" ]; then
  green ""
  green "✅ النشر نجح"
  cyan  "   http://13.49.223.91/login"
  cyan  "   http://13.49.223.91/api/v1/health"
else
  red ""
  red "🔴 فشل الفحص — شوف اللوج:"
  red "   sudo journalctl -u cloudguard-api -n 60 --no-pager"
  red "   sudo journalctl -u cloudguard-frontend -n 60 --no-pager"
  exit 1
fi
