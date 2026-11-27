# ملاحظة عن الفولدر ده

`0000_init.sql` = الـ DDL الكامل المولّد بـ `drizzle-kit generate` من `src/db/schema.ts`.

**إزاي تستخدمه؟**

| الطريقة | الأمر | متى |
|---|---|---|
| push | `npm run db:push` | الافتراضي — يزامن الـ schema مع الداتابيز مباشرة |
| migration | `npm run db:generate` ثم `npx drizzle-kit migrate` | لو عايز تاريخ migrations في الريبو |

لو مشّيت على طريقة `generate`/`migrate`، شيل `0000_init.sql` من هنا وسيب drizzle-kit يولد ملفات الـ migration بنفسه في نفس الفولدر.

الملف موجود هنا كمرجع للفريق وللعرض على اللجنة (`docs/schema.sql` هو نفس المحتوى).
