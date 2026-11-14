export default {
  hero: {
    line1: "اعثر على وظائف تناسبك.",
    line2: "أنشئ ملفاتك المهنية.",
    subtitle: "استخدم سيرتك الحقيقية مع Codex أو Claude Code. يربط Tawdheef مساعدك بسجلاتك المحلية عبر CLI وMCP المدمجين.",
    installNote: "إعداد التطبيق يثبّت هذه المهارة تلقائيًا. استخدم هذا الأمر إذا كنت تحتاج إلى تعليمات سير العمل فقط.",
    setupLink: "إعداد التطبيق",
    source: "اقرأ مصدر المهارة",
    license: "بترخيص MIT",
    release: "الإصدار"
  },
  commandRows: [
    { request: "اقرأ سياق التطبيق المحلي", tool: "get_agent_context" },
    { request: "اعرض الأدوات المتاحة", tool: "get_capabilities" },
    { request: "اعرض أدلة الدول لديّ", tool: "list_directories" },
    { request: "اعرض شركات هذا الدليل", tool: "list_companies" },
    { request: "اقرأ مصادر هذه الشركة", tool: "get_company" },
    { request: "راجع تقارير اتصالات مساعدي", tool: "get_native_client_status" },
    { request: "تحقق من خطوة الإعداد التالية", tool: "get_setup_status" },
    { request: "راجع تقدمي المسجّل", tool: "get_report" }
  ],
  cvShortcut: "أنشئ سيرتك الذاتية أو اربطها",
  start: {
    title: "ابدأ من هنا",
    body: "حمّل التطبيق واربط مساعدك الحالي، ثم استخدم أدوات سيرتك وحساباتك لديه. تصف هذه الخطوات معاينة 0.2؛ تحقّق من الإصدار المختار.",
    requirement: "يسلّم Run العمل إلى تطبيق Codex أو Claude Code الحالي. يقرأ ذلك العميل سيرة Tabbio الحقيقية المصرّح بها قبل المطابقة أو التقديم.",
    researchAlternative: "استكشف بيانات الشركات أولًا",
    download: "حمّل التطبيق",
    repository: "عرض المشروع أو نسخه من GitHub",
    steps: [
      {
        title: "افتح مجلد التطبيق",
        body: "فك ضغط التطبيق كاملاً، أو افتح مجلد المصدر في تطبيق Codex أو Claude Code الذي تستخدمه بالفعل."
      },
      {
        title: "اربط مساعدك",
        body: "انسخ طلب الإعداد إلى تطبيق مساعدك الحالي، أو نفّذ أوامر Codex التالية في مجلد نسخة المصدر."
      },
      {
        title: "أنشئ سيرتك الذاتية أو اربطها",
        body: "أنشئ سيرتك الرقمية المجانية على Tabbio، أو اربط السيرة التي لديك."
      }
    ],
    nodeRequirement: "تحتاج نسخة المصدر إلى Node.js 26 LTS أو Node 24 المحدّث؛ وحزمة التطبيق تتضمن Node.",
    cliIntro: "لإعداد Codex من سطر الأوامر:",
    claudeAlternative: "إذا كنت تستخدم Claude Code، استبدل الأمر الثاني بهذا الأمر:",
    cliNote: "تجهّز هذه الأوامر التطبيق، وتربط أدوات MCP المحلية، وتثبّت مهارة سير العمل.",
    setupPrompt: "انسخ طلب الإعداد",
    cvCreate: "أنشئ سيرتك مجانًا",
    cvConnect: "اربط سيرتك الذاتية",
    cvPath: "افتح Connections ← Tabbio CV، وانسخ طلب الإعداد وأكمل تسجيل الدخول في تطبيق مساعدك.",
    cvCheck: "أعد استخدام اتصال Tabbio MCP في مساعدك وافحص السيرة الفعلية هناك.",
    cvReadNote: "ينسخ Run طلباً لمحادثتك الحالية. تقارير الاتصال المؤرخة ليست تحققاً مستقلاً من الخدمة."
  },
  guideGroups: {
    Start: "ابدأ من هنا",
    Use: "استخدام Tawdheef",
    Fix: "عندما تحتاج إلى مساعدة",
    Reference: "لمساعدك"
  },
  guides: {
    title: "الأدلة",
    body: "جهّز التطبيق، واعثر على وظائف تناسبك، وأنشئ ملفاتك المهنية لفرص مستقبلية."
  },
  cardLabels: {
    run: "تشغيل (Run)",
    replies: "التحقق من الردود",
    doctor: "npm run doctor",
    agents: "MCP / CLI"
  }
};
