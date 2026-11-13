# ربط Codex أو Claude Code

اختر مساعدًا واحدًا. يوفّر Tawdheef أدوات التتبع المحلية وسير العمل، بينما يوفّر حسابك الحالي في المساعد نموذج الذكاء الاصطناعي.

## ربط هذا المشروع {#connect-this-project}

1. شغّل Tawdheef وافتح مجلده في المساعد الذي تستخدمه. سجّل الدخول إلى حسابك في ذلك المساعد.
2. اطلب منه اتباع طلب الإعداد في [دليل البدء](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md)، أو نفّذ أمر مساعدك الموضّح أدناه داخل مجلد Tawdheef.
3. وافق على طلب الثقة بالمشروع أو الخادم. ابدأ محادثة جديدة إذا لم تظهر الأدوات مباشرة.
4. في Tawdheef، افتح **Connections**، واختر مساعدك ضمن **AI assistants**، ثم استخدم **Check connections**.

### ربط المشروع يدويًا {#manual-project-connection}

لاستخدام Codex:

```sh
npm run agent -- codex
```

لاستخدام Claude Code:

```sh
npm run agent -- claude-code
```

تنشئ الأوامر إعدادات MCP خاصة بالمشروع وتثبّت مهارة Tawdheef، مع الحفاظ على ملفاتك المخصّصة. عند وجود تعارض، استخدم الإعدادات المعروضة في Connections لدمج العناصر الناقصة بدلًا من استبدال إعداداتك.

## إضافة أدوات المتصفح عند الحاجة {#add-browser-tools-when-needed}

للتعامل مع نماذج المواقع، اطلب من مساعد الإعداد تثبيت المتصفح:

```sh
npm run setup -- --browser
```

يوفّر **Run** في التطبيق أدواته المقيّدة بنطاق العمل. ولإضافة أدوات المتصفح إلى محادثة Codex حالية، استخدم `npm run agent -- codex --browser`؛ واستبدل `codex` بـ`claude-code` عند استخدام Claude Code.

## تثبيت المهارة فقط {#install-just-the-skill}

إذا كان التطبيق متصلًا بالفعل، وتحتاج فقط إلى تعليمات سير العمل:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

المهارة وحدها لا تثبّت التطبيق ولا تربط حسابًا. في Codex، اذكر `$tawdheef`؛ وفي Claude Code، استخدم `/tawdheef`.

## النتيجة المتوقعة {#expected-result}

يمكن لمساعدك استدعاء `get_agent_context` و`get_capabilities`. ويتحقق فحص الاتصال من تسجيل دخول المساعد الذي اخترته. وقد يطلب منك إكمال ربط السيرة الذاتية قبل أن يصبح Run جاهزًا.
