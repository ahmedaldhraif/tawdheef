# Tabbio integration page draft

Prepared 14 November 2026. Ready-to-review copy for a supporting page on Tabbio's website. This is not a new Tawdheef landing page or a published Tabbio page.

Proposed routes: `/en/integrations/tawdheef/` and `/ar/integrations/tawdheef/`. Confirm the actual Tabbio route structure before implementation. Tawdheef.com is the intended canonical product home; domain ownership and deployment are still pending verification. The working links below use GitHub until those public destinations are verified.

Use Tabbio's real wordmark and existing site components. A small Tawdheef mark can identify the integration. Preserve each brand's artwork and avoid an endorsement badge, sales modal or plan comparison.

## English copy

### Use your Tabbio CV with Tawdheef.

Keep your CV in Tabbio, then use it with Tawdheef to research companies, find matching jobs and track your job search on your computer.

Tawdheef is a free, open-source project built and personally maintained by Ahmed AlDhraif. Your own Codex or Claude Code provides the assistant and browser tools. Tabbio supplies the CV connection.

### What you need

- Tawdheef running locally and your installed, signed-in Codex or Claude Code.
- A Tabbio CV containing your real experience.

Tawdheef's Run currently requires a readable connected Tabbio CV. Public company research and manual tracking are available without one. The app is free; your assistant and connected providers may have their own costs or limits.

### Connect your CV

1. Follow [Tawdheef's setup guide](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/use-the-skill.md) if the app is not ready yet.
2. In Tawdheef, open **Connections → Your CV → Tabbio CV → Connect** and complete sign-in.
3. Choose your assistant in Connections and use **Check connections**. Once your CV is readable, review companies with your agent and choose the actions you want to start.

Tawdheef reads your connected CV. Editing or publishing your CV uses Tabbio's separate tools and your request for that action. Connecting a CV or completing setup does not start applications.

**Need a CV?** [Create your free Tabbio CV](https://app.tabbio.com/?utm_source=tawdheef&utm_medium=tabbio_integration&utm_campaign=live_cv).

**Already have one?** [Connect your existing CV](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/connect-your-cv.md).

[Set up Tawdheef](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/use-the-skill.md) · [Explore the open-source project](https://github.com/ahmedaldhraif/tawdheef)

## النص العربي

### استخدم سيرتك من Tabbio مع Tawdheef.

احتفظ بسيرتك في Tabbio، ثم استخدمها مع Tawdheef لاستكشاف الشركات والبحث عن وظائف مناسبة ومتابعة بحثك عن عمل على جهازك.

Tawdheef مشروع مجاني ومفتوح المصدر، بناه ويديره Ahmed AlDhraif بصفة شخصية. يوفّر حسابك في Codex أو Claude Code المساعد وأدوات المتصفح، وتوفّر Tabbio ربط السيرة الذاتية.

### ما تحتاج إليه

- تطبيق Tawdheef يعمل على جهازك، مع تثبيت Codex أو Claude Code وتسجيل الدخول إليه.
- سيرة على Tabbio تتضمن خبراتك الحقيقية.

يحتاج Run حاليًا إلى سيرة مرتبطة من Tabbio يمكن قراءتها. يمكنك البحث في أدلة الشركات العامة ومتابعة السجلات يدويًا دونها. التطبيق مجاني، وقد تكون لحساب مساعدك والخدمات المرتبطة تكاليف أو حدود مستقلة.

### اربط سيرتك

1. اتبع [دليل إعداد Tawdheef](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/i18n/ar/guides/use-the-skill.md) إذا لم يكن التطبيق جاهزًا.
2. في Tawdheef، افتح **Connections → Your CV → Tabbio CV → Connect** وأكمل تسجيل الدخول.
3. اختر مساعدك في Connections واستخدم **Check connections**. بعد التأكد من إمكانية قراءة سيرتك، راجع الشركات مع مساعدك واختر الإجراءات التي تريد بدءها.

يقرأ Tawdheef سيرتك المرتبطة. أما تعديل السيرة أو نشرها فيستخدم أدوات Tabbio المنفصلة وطلبك لتنفيذ ذلك. ربط السيرة أو إكمال الإعداد لا يبدأ طلبات التوظيف.

**تحتاج إلى سيرة؟** [أنشئ سيرتك مجانًا على Tabbio](https://app.tabbio.com/?utm_source=tawdheef&utm_medium=tabbio_integration_ar&utm_campaign=live_cv).

**لديك سيرة بالفعل؟** [اربط سيرتك الحالية](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/i18n/ar/guides/connect-your-cv.md).

[أعدّ Tawdheef](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/i18n/ar/guides/use-the-skill.md) · [استكشف المشروع المفتوح المصدر](https://github.com/ahmedaldhraif/tawdheef)

## Implementation notes

- Keep the main action focused on setup or connection, according to the visitor's actual state. Use ordinary navigation for the two existing/new-CV paths; a draft cannot detect account state.
- Keep the full product explanation, directory library, contribution pages and canonical Tawdheef content on Tawdheef's own home. This supporting page explains the Tabbio CV connection and links back to the project.
- Replace GitHub guide links with verified canonical Tawdheef guide URLs only after deployment checks. Do not publish links to a parking page or an assumed Tabbio route.
- UTM values here distinguish a visit source; they do not prove signup, CV completion, connection or application success. Review them with the destination's attribution convention before implementation.
- No Tabbio source code, production page, analytics configuration or account state has been changed by this document. Broader Tabbio CV editing/publishing remains a separate connection and action.
