# إعداد Tawdheef مع مساعدك

## التثبيت {#install}

نزّل Tawdheef من [إصدارات GitHub](https://github.com/ahmedaldhraif/tawdheef/releases)، ثم فك ضغط ملف ZIP الخاص بمصدر التطبيق.

[app-download]: #

افتح المجلد المستخرج في **Codex أو Claude Code** بعد تثبيته وتسجيل الدخول إلى حسابك. تحتاج إلى [Node.js 24 أو أحدث](https://nodejs.org/en/download)؛ ويمكن لمساعدك إرشادك لتثبيته عند الحاجة.

## ربط المساعد {#agent}

افتح مجلد Tawdheef في مساعدك، ثم انسخ إليه [طلب الإعداد](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md#give-your-agent-one-setup-request). سيتحقق من الإعداد الحالي، ويشغّل التطبيق، ويربط الأدوات المحلية ومهارة العمل.

[setup-prompt]: #

أكمل تسجيل الدخول واختيار الحسابات في **Connections**. وافق على طلب الثقة بالمشروع أو الخادم عندما يظهر في مساعدك، ثم استخدم **Check connections**.

استخدم Codex أو Claude Code على جهازك؛ فمحادثات ChatGPT وClaude على الويب لا تقرأ إعدادات MCP المحلية للتطبيق.

### إذا كنت تفضّل الطرفية {#if-you-prefer-the-terminal}

نفّذ الأوامر التالية داخل المجلد المستخرج لتثبيت أدوات المتصفح، وربط Codex، وتشغيل التطبيق:

```sh
npm run setup -- --browser
npm run agent -- codex --browser
npm start
```

إذا كنت تستخدم Claude Code، استبدل الأمر الثاني بالتالي:

```sh
npm run agent -- claude-code --browser
```

تنشئ هذه الأوامر إعدادات MCP خاصة بالمشروع وتثبّت المهارة. تبقى إعداداتك المخصّصة محفوظة؛ وعند وجود تعارض، اتبع تعليمات الدمج التي تظهر. أعد فتح المشروع أو ابدأ محادثة جديدة ليحمّل مساعدك الأدوات. تستخدم الشاشة وCLI وMCP السجلات المحلية نفسها.

يثبّت `npm run setup -- --all` أيضًا أداة Tabbio CLI المنفصلة، وهي اختيارية لهذا الإعداد. راجع [ربط مساعدك](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/connect-your-agent.md) للتفاصيل.

## السيرة الذاتية {#cv}

1. [أنشئ سيرتك الذاتية مجانًا](https://app.tabbio.com/?utm_source=tawdheef&utm_medium=setup&utm_campaign=live_cv) على Tabbio، أو استخدم حسابك الحالي. أضف خبراتك وتعليمك ومهاراتك الحقيقية وراجعها.
2. في Tawdheef، افتح **Connections → Your CV → Tabbio CV → Connect** وأكمل تسجيل الدخول.
3. اختر مساعدك في **Connections**، ثم استخدم **Check connections** للتحقق من تسجيل دخوله وقراءة سيرتك المرتبطة.

تحتاج إلى سيرة مرتبطة يمكن قراءتها قبل بدء Run. ويمكنك تصفح الأدلة وتتبع السجلات من دونها. راجع [إنشاء سيرتك أو ربطها](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/connect-your-cv.md) إذا تعذّرت القراءة.

يمكن لمساعدك إجراء التحقق النهائي نفسه عبر `get_setup_status`، باستخدام `verify:true` والمساعد الذي اخترته. لاستخدام CLI، احفظ البيانات التالية في `.local/setup-check.json`، واستبدل `codex` بـ`claude-code` عند الحاجة:

```json
{"verify":true,"assistant":"codex"}
```

ثم نفّذ:

```sh
node bin/apply-tracker.mjs call get_setup_status --input-file .local/setup-check.json
```

استخدم مجلد بياناتك الخاص إذا غيّرت `APPLY_TRACKER_DATA`.

لاستخدام Tabbio CLI المنفصلة، يمكنك اختياريًا تنفيذ `npm run setup -- --login tabbio` وإكمال تسجيل الدخول. اتبع [دليل الربط الرسمي من Tabbio](https://www.tabbio.com/en/mcp). يقرأ Tawdheef سيرتك المرتبطة؛ أما تعديلها أو نشرها عبر Tabbio فيحتاج إلى اتصال وطلب منفصلين.

## سير العمل {#workflow}

اختر دليل الإمارات المرفق أو [أضف حزمة لدولة أخرى](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/use-directory-packs.md). صفِّ الشركات أو حدّد الشركات المستهدفة، ووضّح الوظائف والمواقع التي تريدها، ثم ابدأ **Run** ضمن هذا النطاق.

يراجع مساعدك أدلة المصادر وسيرتك الحقيقية، ثم يسجّل النتائج الفعلية والخطوات التالية. الملفات المهنية ورفع السيرة وطلبات التوظيف المؤكدة نتائج منفصلة. [اقرأ دليل التشغيل](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/apply-to-jobs.md).

## الاستخدام {#use}

في Codex، اذكر `$tawdheef`. وفي Claude Code، استخدم `/tawdheef`. أعطِ مساعدك إحدى المهام التالية، واستبدل النص بين الأقواس بأهدافك أو تفضيلاتك.

### الاتصال جاهز؟ ثبّت المهارة فقط {#already-connected-install-just-the-skill}

إعداد التطبيق يثبّت المهارة بالفعل. إذا كنت تحتاج إلى تعليماتها فقط في مساعد آخر يدعمها، فنفّذ:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

اختر مساعدك في برنامج التثبيت. يضيف هذا تعليمات العمل؛ ولا يثبّت التطبيق، أو يربط أدوات MCP، أو يسجّل الدخول إلى الحسابات، أو يمنح إذنًا بإجراءات البحث عن عمل. [اقرأ مصدر المهارة](https://github.com/ahmedaldhraif/tawdheef/blob/main/skills/tawdheef/SKILL.md).

### طلبات جاهزة {#prompts}

إعداد قائمة مختصرة:

```text
Shortlist 10 companies in [directory] for [role and location]. Check the source evidence and my connected CV. Explain the fit and missing information. Do not apply or send messages.
```

بدء جولة تقديم بطلب صريح:

```text
Start an application run for [company names] in [directory] for [role and location]. Use my real CV, check duplicates and apply to suitable roles within that scope. Record confirmations and anything that needs me.
```

مراجعة العمل السابق:

```text
Check replies for my tracked application threads. Summarise real changes and next actions, then save a local report. Do not start applications, send follow-ups or email the report.
```

## الصلاحيات {#permissions}

إعداد التطبيق وتثبيت المهارة لا يمنحان إذنًا بالتقديم أو إنشاء الملفات المهنية أو مشاركة السيرة. تغطي الجولة المطلوبة الأهداف والإجراءات التي طلبتها فقط. قد تحتاج إلى إكمال تسجيل الدخول أو CAPTCHA أو موافقات الخدمة؛ وتبقى خطوات التقديم عبر LinkedIn يدوية. يحتاج طلب التوظيف إلى إيصال أو تأكيد فعلي، وتُحفظ أدلة العمل على الملفات المهنية بصورة منفصلة.

## الخصوصية {#privacy}

تبقى بيانات التتبع وبيانات الدخول في مجلد التطبيق المحلي. تعالج خدمات الذكاء الاصطناعي والسيرة والبريد المتصلة البيانات وفق صلاحياتها وشروطها. أدخل بيانات الدخول الخاصة في Connections، وليس في المحادثة أو بلاغات GitHub العامة.

Tawdheef مجاني؛ وقد تكون لحساب مساعدك والخدمات المتصلة تكاليف مستقلة. [اقرأ دليل الخصوصية](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/policies/PRIVACY.md).
