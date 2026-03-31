# 🕹️ **مولد طلبات الألعاب (Game Request Generator)**
> _تطبيق مكتبي متكامل لإدارة وتتبع تقدم الألعاب، أتمتة طلبات الشبكة، وإدارة المهام اليومية باحترافية وسريعة. مبني باستخدام Tauri و React و Rust._

<div align="center">
  <img src="https://img.shields.io/badge/Language-English-blue?style=flat-square" alt="English">
  <a href="locales/README.en.md">English Version</a> |
  <img src="https://img.shields.io/badge/Language-Arabic-green?style=flat-square" alt="Arabic">
  <a href="#">النسخة العربية</a>
</div>

---

## 📖 **نظرة عامة**
> _يهدف هذا المشروع إلى تبسيط عملية تتبع تقدم الألعاب من خلال واجهة مستخدم عصرية وأدوات تحليل قوية. يدعم التطبيق إدارة آلاف الحسابات مع ميزات الأتمتة المتقدمة والمزامنة عبر تيليجرام لضمان أعلى مستويات الكفاءة والأمان._

---

## 📋 **قائمة المحتويات** <a id="toc"></a>
1. [✨ المميزات الرئيسية](#features)
2. [💻 التقنيات المستخدمة](#tech-stack)
3. [🚀 ابدأ الآن](#getting-started)
4. [📤 المزامنة والأتمتة (تيليجرام)](#telegram-sync)
5. [📊 تقارير Excel المتقدمة](#excel-reports)
6. [🛠️ مكرر الطلبات HTTP](#http-repeater)
7. [📁 هيكلية المشروع](#project-structure)
8. [🖼️ جولة بصرية](#visual-tour)
9. [📜 التراخيص](#license)

---

## ✨ **المميزات الرئيسية** <a id="features"></a>
- **📅 إدارة المهام الذكية**: توزيع تلقائي للمهام اليومية بناءً على خوارزميات التجميع لضمان تغطية الحسابات.
- **🔗 محاكي Burp Suite**: أداة Repeater مدمجة لتعديل وإعادة إرسال طلبات الـ HTTP يدوياً وسهولة التحليل.
- **🌐 نظام بروكسي ذكي**: دعم كامل لـ HTTP/Socks5 مع ميزات الكشف التلقائي عن الصلاحية.
- **🚀 واجهة عصرية Premium**: تصميم يدعم الثيمات المتعددة واللغتين العربية والإنجليزية مع استجابة كاملة.

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

---

## 💻 **التقنيات المستخدمة** <a id="tech-stack"></a>
- **Tauri 2.0**: لبناء نواة التطبيق المكتبي باستخدام لغة Rust.
- **React & TypeScript**: لتطوير واجهة المستخدم العصرية والتفاعلية.
- **Rust Engine**: لمعالجة المهام الثقيلة وإدارة قاعدة البيانات بأداء عالٍ.
- **pnpm Workspaces**: لإدارة حزم المشروع الموحد (Monorepo) بكفاءة.

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

---

## 🚀 **ابدأ الآن** <a id="getting-started"></a>

### المتطلبات الأساسية
- [x] **Node.js (v18+)**
- [x] **Rust (Stable)**
- [x] **pnpm** (مثبت عالمياً)

### خطوات التثبيت
1. استنساخ المستودع:
   ```bash
   git clone https://github.com/Ahmad-J-Bary/game-request-generator.git
   cd game-request-generator
   ```

2. تثبيت الحزم:
   ```bash
   pnpm install
   ```

3. تشغيل التطبيق في وضع التطوير:
   ```bash
   pnpm start
   ```

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

---

## 📤 **المزامنة والأتمتة (تيليجرام)** <a id="telegram-sync"></a>
- **النسخ الاحتياطي السحابي**: رفع وتحميل نسخة كاملة من قاعدة البيانات بضغطة زر واحدة.
- **تقارير الإنجاز**: إرسال ملفات الـ Excel تلقائياً إلى مجموعات تيليجرام المحددة.
- **التنبيهات**: استلام إشعارات فورية عند انتهاء المهام أو وجود مشاكل في البروكسي.

<p align="center">
  <img src="screenshots/telegram-sync.ar.png" width="850" alt="Telegram Sync">
  <br>
  <em>واجهة المزامنة مع تيليجرام وإدارة النسخ الاحتياطي السحابي</em>
</p>

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

---

## 📊 **تقارير Excel المتقدمة** <a id="excel-reports"></a>
- **أتمتة سير العمل**: التكامل المشر من خلال إرسال ملفات التقارير تلقائياً إلى مجموعات تيليجرام فور إتمام المهام اليومية.
- **كفاءة المتابعة**: تقارير "بيانات نقية" مصممة للمشاركة المباشرة مع فرق العمل لضمان تتبع دقيق وسريع لنسب الإنجاز.
- **إدارة الحسابات الضخمة**: ملخصات شاملة لكافة الحسابات بضغطة زر واحدة، مما يقلل الحاجة للمراجعة اليدوية المستمرة.

<p align="center">
  <img src="screenshots/excel-reports.ar.png" width="850" alt="Excel Reports">
  <br>
  <em>نموذج لتقارير الإكسل المتقدمة لإدارة تتبع تقدم الألعاب</em>
</p>

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

---

## 🛠️ **مكرر الطلبات HTTP (Repeater)** <a id="http-repeater"></a>
- **تحكم كامل**: تحرير الترويسات (Headers) والحمولات (Payloads) بدقة واحترافية.
- **دعم البروتوكولات**: توافقية كاملة مع HTTP/1.1 و HTTP/2.
- **الارتباط بالبروكسي**: احترام إعدادات البروكسي العامة للتطبيق في كافة الطلبات المرسلة.

<p align="center">
  <img src="screenshots/http-repeater.ar.png" width="850" alt="HTTP Repeater">
  <br>
  <em>محاكي الطلبات (Repeater) المطور لتحليل واختبار طلبات الشبكة</em>
</p>

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

---

## 📁 **هيكلية المشروع** <a id="project-structure"></a>
 ```bash
 game-request-generator/
 ├── apps/
 │   └── desktop-mobile/           # التطبيق الرئيسي (Tauri + Vite + React)
 │       ├── src/                  # واجهة المستخدم (Frontend - React)
 │       │   ├── pages/            # لوحات التحكم وواجهات العرض الرئيسية
 │       │   │   ├── Dashboard/    # لوحة التحكم المركزية والإحصائيات
 │       │   │   ├── Accounts/     # إدارة الحسابات والمجموعات
 │       │   │   ├── DailyTasks/   # مجدول المهام اليومي والأتمتة
 │       │   │   └── Settings/     # إعدادات النظام والربط البرمي
 │       │   └── assets/           # المصادر الرسومية والقوالب الثابتة
 │       └── src-tauri/            # المحرك الخلفي (Backend Bridge - Rust)
 │           └── src/lib.rs        # تعريف الـ Commands ومنطق الربط الأساسي
 ├── packages/
 │   ├── grq-ui/ (Atomic Design)   # المكتبة الرسومية الموحدة للمكونات
 │   │   ├── atoms/ molecules/ organisms/ templates/
 │   ├── grq-core/                 # منطق العمل الموحد والخدمات المشتركة
 │   │   └── src/
 │   │       ├── services/         # (TauriService, ExcelService, ApiService, etc)
 │   │       ├── hooks/            # الـ Custom Hooks لإدارة الواجهة
 │   │       ├── contexts/         # إدارة حالة التطبيق (State Management)
 │   │       └── utils/            # أدوات مساعدة (TaskGenerator, Validation, etc)
 │   └── grq-api-bindings/         # بروتوكولات التواصل وأنواع البيانات المشتركة
 ├── crates/
 │   └── grq-engine/               # المحرك التقني العميق (Deep Engine - Rust)
 │       └── src/
 │           ├── db/               # طبقة إدارة قاعدة البيانات (SQLite/Diesel)
 │           ├── models/           # تعريف الجداول وهياكل البيانات في الرست
 │           └── services/         # تنفيذ العمليات التقنية المعقدة والأداء العالي
 └── locales/                      # التوثيق والترجمة لمختلف اللغات
 ```

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

---

## 🖼️ **جولة بصرية** <a id="visual-tour"></a>

<p align="center">
  <img src="screenshots/dashboard.ar.png" width="850" alt="Dashboard">
  <br>
  <em>نظرة عامة على لوحة التحكم (Dashboard) وواجهة المستخدم الرئيسية</em>
</p>

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

---

## 📜 **التراخيص** <a id="license"></a>
هذا المشروع مرخص بموجب رخصة MIT. راجع ملف `LICENSE` لمزيد من المعلومات.

<div align="center">
  <a href="#toc">🔝 العودة للأعلى</a>
</div>

<p align="center"> تم التطوير بكل ❤️ بواسطة <a href="https://github.com/Ahmad-J-Bary">@Ahmad Abdelbary</a> </p>
