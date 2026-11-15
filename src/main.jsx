import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Briefcase,
  Mail,
  Plug,
  Settings as SettingsIcon,
  Github,
  Plus,
  Search,
  ExternalLink,
  MoreHorizontal,
  X,
  Check,
  Download,
  Upload,
  ShieldCheck,
  Play,
  AlertCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Trash2,
  Undo2,
  FolderOpen,
  Globe2,
} from "lucide-react";
import "./styles.css";
import { Editable, Modal, Form, ModalNotification } from './SharedUI.jsx';
import './workspace-depth.css';
import Flag from "./Flag.jsx";
import BrandIcon from "./BrandIcon.jsx";
import DirectorySymbolPicker from "./DirectorySymbolPicker.jsx";
import { getDirectorySymbol } from "./directory-symbols.js";
import ListOptions from "./ListOptions.jsx";
import RunDialog, { RunProgress } from './RunDialog.jsx';
import useRunUpdates from './useRunUpdates.js';
import CompanyFilters from './CompanyFilters.jsx';
import CompanyProgress, { PROGRESS_LABELS } from './CompanyProgress.jsx';
import DirectorySnapshot from './DirectorySnapshot.jsx';
import DiscoveryPanel, { DISCOVERY_AR, discoveryApi } from './DiscoveryPanel.jsx';
import DirectoryPacksDialog from './DirectoryPacksDialog.jsx';
import ConnectionsHub from './ConnectionsHub.jsx';
import MonitoringPanel, { MonitoringSummary } from './MonitoringPanel.jsx';
import WorkspaceBackground from './WorkspaceBackground.jsx';
import TawdheefBrand, { TawdheefMark } from './TawdheefBrand.jsx';
import './directory-header.css';

const LABELS = {
  not_started: "Not started",
  ready: "Ready",
  applied: "Applied",
  replied: "Replied",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

const savedView = (id) => {
  try {
    return JSON.parse(localStorage.getItem("apply-view-" + id) || "{}");
  } catch {
    return {};
  }
};
const FIELDS = {
  name: "Company",
  status: "Status",
  progress: "Career profile",
  nextAction: "Next action",
  lastUpdate: "Last update",
  careersUrl: "Contacts",
  notes: "Notes",
  sector: "Sector",
  type: "Company type",
  location: "Location",
  email: "Careers email",
  linkedinUrl: "LinkedIn",
  sourceRole: "Source type",
  routeStatus: "Route check",
  followUpAt: "Follow-up",
};
const AR = {
  ...DISCOVERY_AR,
  'Contact email (optional)': 'بريد التواصل (اختياري)',
  'Add contact email': 'إضافة بريد للتواصل',
  'Optional hint for your assistant. It confirms the account and sender.': 'اقتراح اختياري لمساعدك، وهو يتأكد من الحساب وعنوان الإرسال.',
  'Export all companies (CSV)': 'تصدير كل الجهات (CSV)',
  'Company list unavailable': 'قائمة الجهات غير متاحة',
  'Progress and monitoring': 'التقدم والمتابعة',
  'Open source': 'مفتوح المصدر',
  'Open at sign-in': 'الفتح عند تسجيل الدخول',
  'Updates stay in your assistant': 'التحديثات تبقى في مساعدك',
  'Monitoring off': 'المتابعة متوقفة',
  'Awaiting first check': 'بانتظار أول تحقق',
  'Updates': 'تحديثات',
  'Monitoring unavailable': 'المتابعة غير متاحة',
  'Reports & replies': 'التقارير والردود',
  'Career profile': 'الملف المهني',
  'Career routes': 'مسارات التوظيف',
  'Careers page availability': 'صفحة الوظائف',
  'Account / profile': 'الحساب / الملف المهني',
  'No careers page found': 'لم يُعثر على صفحة وظائف',
  'No account / profile offered': 'لا تتوفر خدمة حساب أو ملف مهني',
  'Source or reason': 'المصدر أو السبب',
  'Available': 'متاح',
  'Not checked': 'لم يُفحص',
  'Needs checking': 'يحتاج إلى فحص',
  'Not offered': 'غير متاح',
  'Preferences': 'التفضيلات',
  'Reports & replies': 'التقارير والردود',
  'by': 'بواسطة',
  'Contribute': 'ساهم في التطوير',
  'Suggest a correction': 'اقترح تصحيحاً',
  'Company list unavailable': 'قائمة الجهات غير متاحة',
  'Activity period': 'فترة النشاط',
  'Follow-ups and Needs you show the current state.': 'المتابعات وما يحتاج تدخلك يعرضان الحالة الحالية.',
  'Directory packs': 'حزم الأدلة',
  'Browse community packs': 'تصفّح حزم المجتمع',
  'Manage directory packs': 'إدارة حزم الأدلة',
  'Directory added': 'تمت إضافة الدليل',
  'Career profiles and future opportunities': 'الملفات المهنية والفرص المستقبلية',
  'Shared company history from other directories is included.': 'يتضمن تاريخ الجهة المشترك من الأدلة الأخرى.',
  'Discard unsaved changes?': 'هل تريد تجاهل التغييرات غير المحفوظة؟',
  'Your changes have not been saved.': 'لم تُحفظ تغييراتك.',
  'Keep editing': 'متابعة التعديل',
  'Discard changes': 'تجاهل التغييرات',
  'Saving…': 'جارٍ الحفظ…',
  'Try again': 'حاول مجدداً',
  'Assistant': 'المساعد',
  'Tabbio CV': 'سيرة Tabbio الذاتية',
  'Calendar': 'التقويم',
  'Browser & computer use': 'المتصفح والتحكم بالجهاز',
  'Passwords': 'كلمات المرور',
  'Optional': 'اختياري',
  'Done': 'تم',
  'Back to connections': 'العودة إلى الاتصالات',
  'Checked': 'تم الفحص',
  'Copy setup request': 'نسخ طلب الإعداد',
  'Setup request copied': 'تم نسخ طلب الإعداد',
  'Local connection observed': 'رُصد اتصال محلي',
  'Connection details': 'تفاصيل الاتصال',
  'Your connections stay in your assistant.': 'تبقى اتصالاتك في تطبيق مساعدك.',
  'Setup readiness': 'جاهزية الإعداد',
  'Setup details': 'تفاصيل الإعداد',
  'Checking setup…': 'جارٍ فحص الإعداد…',
  'Setup check unavailable': 'فحص الإعداد غير متاح',
  'Ready to start': 'جاهز للبدء',
  'Setup not checked': 'لم يُفحص الإعداد',
  'Setup could not be checked. Try again.': 'تعذّر فحص الإعداد. حاول مجدداً.',
  'Connect your assistant to Tawdheef.': 'اربط مساعدك بتوظيف.',
  'Ask your assistant to read your CV.': 'اطلب من مساعدك قراءة سيرتك الذاتية.',
  'Check the intended mailbox in your assistant.': 'تحقق من البريد المطلوب في مساعدك.',
  'Check browser access in your assistant.': 'تحقق من إمكانية استخدام المتصفح في مساعدك.',
  'Reported by': 'أبلغ عنه',
  'Through MCP': 'عبر MCP',
  'Through browser': 'عبر المتصفح',
  'Through computer use': 'عبر التحكم بالجهاز',
  'Through a file': 'عبر ملف',
  'Through your assistant': 'عبر مساعدك',
  'Your assistant checks its existing connections.': 'يفحص مساعدك اتصالاته الحالية.',
  'Readable CV': 'سيرة ذاتية متاحة للقراءة',
  'CV upload file': 'ملف السيرة الذاتية للرفع',
  'Intended mailbox': 'البريد المطلوب',
  'Browser access': 'إمكانية استخدام المتصفح',
  'Career sign-in': 'دخول مواقع التوظيف',
  'Use Tabbio in your assistant to read your real CV.': 'استخدم Tabbio في مساعدك لقراءة سيرتك الذاتية الفعلية.',
  'Email for new accounts': 'البريد للحسابات الجديدة',
  'Use the observed mailbox': 'استخدام البريد الذي فحصه المساعد',
  'Your assistant checks this mailbox. Existing accounts keep their sign-in.': 'يتحقق مساعدك من هذا البريد. تبقى بيانات دخول الحسابات الحالية كما هي.',
  'The reported mailbox is different. Ask your assistant to select this account before registering.': 'البريد الذي أبلغ عنه المساعد مختلف. اطلب منه اختيار هذا الحساب قبل التسجيل.',
  'Open page': 'فتح الصفحة',
  'Resume': 'متابعة',
  'Copy into your assistant': 'انسخ الطلب إلى مساعدك',
  'Choose a directory': 'اختيار دليل',
  'The setup request could not be prepared. Try again.': 'تعذّر تجهيز طلب الإعداد. حاول مرة أخرى.',
  'Browser and computer use are managed in your assistant.': 'يتولى مساعدك إدارة أدوات المتصفح والتحكم بالجهاز.',
  'Change': 'تغيير',
  'Monitoring': 'المتابعة',
  'Loading monitoring settings…': 'جارٍ تحميل إعدادات المتابعة…',
  'Monitor with': 'المتابعة عبر',
  'What to monitor': 'ما تريد متابعته',
  'Matching jobs': 'الوظائف المناسبة',
  'Application emails': 'رسائل طلبات التوظيف',
  'Companies': 'الجهات',
  'Scope': 'النطاق',
  'Saved companies': 'الجهات المحفوظة',
  'saved company': 'جهة محفوظة',
  'saved companies': 'جهات محفوظة',
  'saved directory': 'دليل محفوظ',
  'saved directories': 'أدلة محفوظة',
  'Use current list': 'استخدام القائمة الحالية',
  'Choose a calendar': 'اختيار تقويم',
  'Open Calendar in Connections': 'فتح التقويم في الاتصالات',
  'Calendar events in the next 14 days.': 'أحداث التقويم خلال الأيام الأربعة عشر القادمة.',
  'Frequency': 'التكرار',
  'Your saved time zone': 'منطقتك الزمنية المحفوظة',
  'Check in progress': 'الفحص جارٍ',
  'Last check': 'آخر فحص',
  'Last successful check': 'آخر فحص ناجح',
  'Last result': 'آخر نتيجة',
  'unread update': 'تحديث غير مقروء',
  'unread updates': 'تحديثات غير مقروءة',
  'source needs attention': 'مصدر يحتاج إلى متابعة',
  'sources need attention': 'مصادر تحتاج إلى متابعة',
  'Awaiting first check': 'بانتظار أول فحص',
  'Set up the local schedule in': 'أعِدّ جدول المتابعة المحلي في',
  'Monitoring is off': 'المتابعة متوقفة',
  'Recent updates': 'آخر التحديثات',
  'Update': 'تحديث',
  'Found': 'جديد',
  'Changed': 'تغيّر',
  'Source': 'المصدر',
  'Open company': 'فتح الجهة',
  'Mark as read': 'تحديد كمقروء',
  'Marking as read…': 'جارٍ التحديد كمقروء…',
  'No updates recorded yet.': 'لا توجد تحديثات مسجلة بعد.',
  'Your assistant checks for changes. Applications, messages and calendar changes need a separate request.': 'يتابع مساعدك التغييرات. يتطلب تقديم الطلبات وإرسال الرسائل وتعديل التقويم طلباً منفصلاً.',
  'Preparing request…': 'جارٍ تجهيز الطلب…',
  'Schedule request copied': 'تم نسخ طلب الجدولة',
  'Copy schedule request': 'نسخ طلب الجدولة',
  'Paste into': 'الصق الطلب في',
  'Creating the schedule happens there.': 'يُنشأ جدول المتابعة هناك.',
  'The schedule request could not be prepared. Try again.': 'تعذّر تجهيز طلب الجدولة. حاول مرة أخرى.',
  'The update could not be marked as read. Try again.': 'تعذّر تحديد التحديث كمقروء. حاول مرة أخرى.',
  'Calendars could not be loaded. Check your connection and try again.': 'تعذّر تحميل التقويمات. تحقق من الاتصال وحاول مرة أخرى.',
  'Local reply checks': 'فحص الردود محلياً',
  'For all directories.': 'لجميع الأدلة.',
  'Preferences': 'التفضيلات',
  'Latest report': 'آخر تقرير',
  'Scheduled updates need this computer awake and online.': 'تحتاج التحديثات المجدولة إلى بقاء هذا الجهاز مستيقظاً ومتصلاً بالإنترنت.',
  'Original CV for uploads': 'ملف السيرة الذاتية الأصلي للرفع',
  'Choose your existing PDF or DOCX for sites that ask for a file. It stays on this computer until an authorized upload.': 'اختر ملف سيرتك الذاتية الحالي بصيغة PDF أو DOCX للمواقع التي تطلب ملفاً. يبقى على هذا الجهاز حتى تسمح برفعه.',
  'CV file': 'ملف السيرة الذاتية',
  'Saving…': 'جارٍ الحفظ…',
  'Choose a PDF or DOCX file up to 10 MB.': 'اختر ملف PDF أو DOCX بحجم لا يتجاوز 10 ميغابايت.',
  'The file could not be read. Choose it again.': 'تعذّرت قراءة الملف. اختره مرة أخرى.',
  'Run actions': 'إجراءات التشغيل',
  'Directory snapshot': 'ملخص الدليل',
  'Snapshot period': 'فترة الملخص',
  'All companies': 'جميع الشركات',
  'All time': 'كل الفترات',
  'This week': 'هذا الأسبوع',
  'Applications sent': 'طلبات التوظيف المُرسلة',
  'Career profiles': 'الملفات المهنية',
  'Emails sent': 'رسائل البريد المُرسلة',
  'Confirmed job applications.': 'طلبات توظيف مؤكدة الإرسال.',
  'Companies with a completed career profile. An account alone does not count.': 'الشركات التي أكملت فيها ملفك المهني. إنشاء حساب فقط لا يُحتسب.',
  'Confirmed application and CV emails. An emailed application also appears under Applications sent.': 'رسائل مؤكدة لطلبات التوظيف والسير الذاتية. يظهر الطلب المُرسل بالبريد أيضاً ضمن طلبات التوظيف المُرسلة.',
  'Confirmed email receipts': 'رسائل لها تأكيد إرسال',
  'Some earlier emails have no saved receipt and aren’t included.': 'بعض الرسائل السابقة ليس لها تأكيد إرسال محفوظ، لذا لم تُحتسب.',
  'Unavailable': 'غير متاح',
  'Loading': 'جارٍ التحميل',
  'Couldn’t load totals.': 'تعذّر تحميل الأعداد.',
  'Couldn’t load records.': 'تعذّر تحميل السجلات.',
  'Loading records…': 'جارٍ تحميل السجلات…',
  'No records for this period.': 'لا توجد سجلات لهذه الفترة.',
  'No confirmed applications for this period.': 'لا توجد طلبات توظيف مؤكدة لهذه الفترة.',
  'No completed career profiles for this period.': 'لا توجد ملفات مهنية مكتملة لهذه الفترة.',
  'No confirmed emails for this period.': 'لا توجد رسائل بريد مؤكدة لهذه الفترة.',
  'Snapshot records': 'سجلات الملخص',
  'Retry': 'إعادة المحاولة',
  'Previous records': 'السجلات السابقة',
  'Next records': 'السجلات التالية',
  'of': 'من',
  'Find matching jobs and build career profiles.': 'اعثر على وظائف مناسبة وأنشئ ملفاتك المهنية.',
  'Create an account or complete my profile': 'أنشئ حساباً أو أكمل ملفي المهني',
  'Apply to jobs that match my CV': 'قدّم على الوظائف المناسبة لسيرتي الذاتية',
  'Email my CV for future opportunities': 'أرسل سيرتي بالبريد لفرص مستقبلية',
  Connections: 'الاتصالات',
  "Apply Tracker": "توظيف",
  "Connect email": "ربط البريد",
  "Connect Tabbio CV": "ربط سيرة تابيو",
  "Connect AI": "ربط المساعد",
  Settings: "الإعدادات",
  "Add directory": "إضافة دليل",
  "Search companies": "ابحث عن جهة",
  All: "الكل",
  "Not started": "لم يبدأ",
  Ready: "جاهز",
  Applied: "تم التقديم",
  Replied: "وصل رد",
  Interview: "مقابلة",
  Offer: "عرض",
  Closed: "مغلق",
  Company: "الجهة",
  Status: "الحالة",
  Progress: "الإنجازات",
  "Company type": "نوع الجهة",
  "Account created": "تم إنشاء حساب",
  "Profile created": "تم إنشاء ملف مهني",
  "CV uploaded": "تم رفع السيرة الذاتية",
  "CV sent": "تم إرسال السيرة الذاتية",
  "Talent pool joined": "تم الانضمام لقاعدة المواهب",
  "View progress for": "عرض إنجازات",
  "No recorded progress yet": "لا توجد إنجازات مسجلة بعد",
  "Accounts created": "حسابات أُنشئت",
  "Profiles created": "ملفات مهنية أُنشئت",
  "CVs uploaded": "سير ذاتية رُفعت",
  "CVs sent": "سير ذاتية أُرسلت",
  "Talent pools joined": "قواعد مواهب انضممت إليها",
  "City / location": "المدينة / الموقع",
  "Federal government": "حكومة اتحادية",
  "Local government": "حكومة محلية",
  "Government-owned / semi-government": "مملوكة للحكومة / شبه حكومية",
  "Private companies": "شركات خاصة",
  "Other organisations": "جهات أخرى",
  "Unknown type": "نوع غير مؤكد",
  "Next action": "الخطوة التالية",
  "Last update": "آخر تحديث",
  "Updates & reports": "التحديثات والتقارير",
  "Update schedule": "جدول التحديثات",
  "Check replies now": "التحقق من الردود الآن",
  Careers: "الوظائف",
  Contacts: "روابط التواصل",
  Website: "الموقع",
  "Careers page": "صفحة الوظائف",
  Email: "البريد",
  Notes: "ملاحظات",
  Sector: "القطاع",
  Location: "الموقع",
  "Careers email": "بريد التوظيف",
  LinkedIn: "لينكدإن",
  "Source type": "نوع المصدر",
  "Route check": "حالة الرابط",
  "Follow-up": "المتابعة",
  "Update now": "تحديث الآن",
  "Check replies": "التحقق من الردود",
  "List options": "خيارات القائمة",
  "Choose columns": "اختيار الأعمدة",
  "Import list": "استيراد قائمة",
  "Export CSV": "تصدير CSV",
  "All statuses": "كل الحالات",
  "Application status": "حالة التقديم",
  "Needs attention": "يحتاج متابعة",
  Add: "إضافة",
  "Follow-ups due": "متابعات مستحقة",
  "Loading companies…": "جارٍ تحميل الجهات…",
  "Add company": "إضافة جهة",
  Columns: "الأعمدة",
  "Apply with AI": "التقديم بالمساعد",
  Export: "تصدير",
  Import: "استيراد",
  "companies & sources": "جهة ومصدر",
  "Saved on this computer": "محفوظ على هذا الجهاز",
  Close: "إغلاق",
  "Save changes": "حفظ التغييرات",
  Cancel: "إلغاء",
  Name: "الاسم",
  "Directory name": "اسم الدليل",
  "Flag or icon": "العلم أو الرمز",
  "Create directory": "إنشاء دليل",
  Search: "بحث",
  "Needs you": "يحتاج تدخلك",
  Never: "لم يتم بعد",
  "No companies found": "لا توجد نتائج",
  "Try another search or add a company.": "جرّب بحثاً آخر أو أضف جهة.",
  Next: "التالي",
  Previous: "السابق",
  Saved: "تم الحفظ",
  "More actions": "إجراءات أخرى",
  "Customize directory": "تخصيص الدليل",
  "Archive directory": "أرشفة الدليل",
  Undo: "تراجع",
  "Select all visible companies": "تحديد الجهات الظاهرة",
  "Open careers": "فتح الوظائف",
  Details: "التفاصيل",
  "Application history": "سجل التقديم",
  "Source details": "تفاصيل المصدر",
  Activity: "النشاط",
  "No applications yet.": "لا توجد طلبات تقديم بعد.",
  Reports: "التقارير",
  Report: "تقرير",
  "Generate report": "إنشاء تقرير",
  "Automatic updates": "التحديثات التلقائية",
  Daily: "يومياً",
  Weekly: "أسبوعياً",
  Hourly: "كل ساعة",
  Manual: "يدوياً",
  Off: "متوقف",
  Custom: "مخصص",
  Time: "الوقت",
  "Time zone": "المنطقة الزمنية",
  Language: "اللغة",
  "Local background service": "الخدمة المحلية في الخلفية",
  Connect: "ربط",
  Disconnect: "فصل",
  "Start run": "بدء التقديم",
  selected: "محددة",
  "Find a suitable role": "ابحث عن وظيفة مناسبة",
  "Check recruitment route": "تحقق من طريقة التوظيف",
  "Waiting for your AI agent": "بانتظار المساعد",
  "Wait for a reply": "بانتظار الرد",
  "Read the reply": "اقرأ الرد",
  "Prepare for interview": "استعد للمقابلة",
  "Continue in your browser": "تابع في المتصفح",
  "Check application details": "راجع تفاصيل الطلب",
  "Add a note": "أضف ملاحظة",
  "No update yet": "لا يوجد تحديث",
  "Source checked": "تاريخ مراجعة المصدر",
  File: "ملف",
  "Paste CSV": "لصق CSV",
  "Review import": "مراجعة الاستيراد",
  "Add to directory": "إضافة إلى الدليل",
  "Unknown": "غير معروف",
  "Back": "رجوع",
  "Client reported": "بحسب إفادة المساعد",
  "Observed": "رُصد في",
  "Reported": "أُفيد في",
  "Use Codex": "استخدام Codex",
  "Use Claude Code": "استخدام Claude Code",
  "Browser": "المتصفح",
  "Computer use": "التحكم بالكمبيوتر",
  "Connect Tabbio MCP in your assistant to use your real CV.": "اربط Tabbio MCP في تطبيق مساعدك لاستخدام سيرتك الذاتية الفعلية.",
  "Create a CV in Tabbio": "إنشاء سيرة ذاتية في Tabbio",
  "Connect your email in your assistant. Tawdheef keeps the recorded outcomes.": "اربط بريدك في تطبيق مساعدك. يحتفظ توظيف بالنتائج المسجلة.",
  "Connect your calendar in your assistant and report the calendars you choose.": "اربط تقويمك في تطبيق مساعدك، ودعه يسجل التقاويم التي تختارها.",
  'Use a unique password for each career site through your assistant’s supported password manager. Reuse existing accounts.': 'استخدم كلمة مرور فريدة لكل موقع توظيف عبر مدير كلمات المرور الذي يدعمه مساعدك. أعد استخدام الحسابات الحالية.',
  "Connect this local tracker to your existing assistant. Continue in the client you already use.": "اربط تطبيق المتابعة المحلي بمساعدك، وتابع في التطبيق الذي تستخدمه بالفعل.",
  "Setup happens in your assistant.": "يتم الإعداد في تطبيق مساعدك.",
  "Waiting for assistant": "بانتظار المساعد",
  "The run request could not be prepared. Try again.": "تعذّر تجهيز طلب التشغيل. حاول مجدداً.",
  "Run request copied": "تم نسخ طلب التشغيل",
  "Copy run request": "نسخ طلب التشغيل",
  "Paste the run request into your existing": "ألصق طلب التشغيل في محادثتك الحالية مع",
  "chat. Keep Tawdheef open to record progress.": "واترك توظيف مفتوحاً لتسجيل التقدم.",
  "Stop any remaining work in your assistant.": "أوقف أي عمل متبقٍ في تطبيق مساعدك أيضاً.",
  "Note (optional)": "ملاحظة (اختياري)",
  "Ask your assistant to report a calendar you choose.": "اطلب من مساعدك تسجيل تقويم تختاره.",
  "Calendar request copied": "تم نسخ طلب التقويم",
  "Copy calendar request": "نسخ طلب التقويم",
};
const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
      }).format(date)
    : "—";
};
const safeHref = (url) => {
  try {
    const u = new URL(url);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "This action could not finish.");
  return data;
}
function App() {
  const settingsDraft = useRef(null);
  const nativeRunDraft = useRef(null);
  const [boot, setBoot] = useState(null),
    [active, setActive] = useState(
      localStorage.getItem("apply-directory") || "uae",
    ),
    [data, setData] = useState({ items: [], total: 0, statusCounts: {} }),
    [query, setQuery] = useState(
      () =>
        savedView(localStorage.getItem("apply-directory") || "uae").query || "",
    ),
    [status, setStatus] = useState(
      () =>
        savedView(localStorage.getItem("apply-directory") || "uae").status ||
        "",
    ),
    [companyTypes, setCompanyTypes] = useState(() => savedView(localStorage.getItem('apply-directory') || 'uae').companyTypes || []),
    [locations, setLocations] = useState(() => savedView(localStorage.getItem('apply-directory') || 'uae').locations || []),
    [filterPending, setFilterPending] = useState(false),
    [selectedPreview, setSelectedPreview] = useState(null),
    [rowsRevision, setRowsRevision] = useState(0),
    [page, setPage] = useState(0),
    [sort, setSort] = useState(
      () =>
        savedView(localStorage.getItem("apply-directory") || "uae").sort ||
        "name",
    ),
    [direction, setDirection] = useState(
      () =>
        savedView(localStorage.getItem("apply-directory") || "uae").direction ||
        "asc",
    ),
    [selected, setSelected] = useState(new Set()),
    [modal, setModal] = useState(null),
    [detail, setDetail] = useState(null),
    [toast, setToast] = useState(null),
    [toastScope, setToastScope] = useState(null),
    [busy, setBusy] = useState(""),
    [rowsLoading, setRowsLoading] = useState(true),
    [rowsError, setRowsError] = useState(""),
    [error, setError] = useState(""),
    [undo, setUndo] = useState(null);
  const actionsInFlight = useRef(new Map());
  const rowsRequest = useRef(0),
    detailRequest = useRef(0),
    toastTimer = useRef(null);
  const overlayKey = detail ? 'company:' + detail.company.id : modal?.type || null;
  const toastRemaining = useRef(6000), toastDeadline = useRef(0), toastInteraction = useRef({ hovered: false, focused: false }), toastActive = useRef(false);
  const pauseToast = useCallback(() => {
    if (toastTimer.current) toastRemaining.current = Math.max(0, toastDeadline.current - Date.now());
    clearTimeout(toastTimer.current); toastTimer.current = null;
  }, []);
  const resumeToast = useCallback(() => {
    clearTimeout(toastTimer.current); toastTimer.current = null;
    if (!toastActive.current || document.hidden || toastInteraction.current.hovered || toastInteraction.current.focused) return;
    toastDeadline.current = Date.now() + toastRemaining.current;
    toastTimer.current = setTimeout(() => { toastActive.current = false; setToast(null); setUndo(null); toastTimer.current = null; }, toastRemaining.current);
  }, []);
  const lang = boot?.settings.language || "en",
    t = useCallback(
      (value) => (lang === "ar" ? AR[value] || value : value),
      [lang],
    );
  const directory = boot?.directories.find((d) => d.id === active),
    columns = directory?.columns || [
      "name",
      "status",
      "progress",
      "nextAction",
      "lastUpdate",
      "careersUrl",
      "notes",
    ];
  const listScope = { directoryId: active, search: query, status: Object.hasOwn(LABELS, status) ? status : '', attention: ['needs_you', 'follow_up_due'].includes(status) ? status : '', companyTypes, locations };
  const listScopeKey = JSON.stringify(listScope);
  const runScope = { ...listScope, ...(selected.size ? { companyIds: [...selected].sort() } : {}) };
  const runScopeKey = JSON.stringify(runScope);
  const rowsCurrent = data._scopeKey === listScopeKey && data.listScopeVersion === 1;
  const runCount = selectedPreview?.scopeKey === runScopeKey ? selectedPreview.count : null;
  const runLabel = runCount == null ? 'Checking companies…' : `Run on ${runCount} ${selected.size ? 'selected' : runCount === 1 ? 'company' : 'companies'}`;
  const chooseDirectory = (id) => {
    const v = savedView(id);
    setActive(id);
    setQuery(v.query || "");
    setStatus(v.status || "");
    setCompanyTypes(Array.isArray(v.companyTypes) ? v.companyTypes : []);
    setLocations(Array.isArray(v.locations) ? v.locations : []);
    setFilterPending(false);
    setSort(v.sort || "name");
    setDirection(v.direction || "asc");
  };
  const notify = (message, undoAction = null) => {
    setToast(message);
    setToastScope(overlayKey);
    setUndo(undoAction);
    toastActive.current = true;
    toastRemaining.current = 6000;
    resumeToast();
  };
  useEffect(() => {
    const visibility = () => document.hidden ? pauseToast() : resumeToast();
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(toastTimer.current); document.removeEventListener('visibilitychange', visibility); };
  }, [pauseToast, resumeToast]);
  useEffect(() => {
    if (!toast) { toastActive.current = false; toastInteraction.current = { hovered: false, focused: false }; pauseToast(); return; }
    const focused = Boolean(document.querySelector('.toast')?.contains(document.activeElement));
    if (toastInteraction.current.focused && !focused) { toastInteraction.current.focused = false; resumeToast(); }
  }, [toast, undo, pauseToast, resumeToast]);
  const loadBoot = useCallback(async () => {
    const [b, monitoring] = await Promise.all([api('/bootstrap'), api('/monitoring').catch(error => ({ error: error.message }))]);
    b.monitoring = monitoring;
    setBoot(b);
    if (!b.directories.length) setActive("");
    if (b.directories.length && !b.directories.some((d) => d.id === active))
      chooseDirectory(b.directories[0].id);
    return b;
  }, [active]);
  const loadRows = useCallback(async () => {
    if (!active) {
      setData({ items: [], total: 0, statusCounts: {} });
      setRowsLoading(false);
      return;
    }
    const request = ++rowsRequest.current;
    setRowsError("");
    const params = new URLSearchParams({
      directoryId: active,
      search: query,
      status: Object.hasOwn(LABELS, status) ? status : "",
      attention:
        status === "needs_you" || status === "follow_up_due" ? status : "",
      limit: "100",
      summary: 'true',
      companyTypes: JSON.stringify(companyTypes),
      locations: JSON.stringify(locations),
      offset: String(page * 100),
      sort,
      direction,
    });
    try {
      const result = await api("/companies?" + params);
      if (request === rowsRequest.current) {
        setData({ ...result, _scopeKey: listScopeKey, _directoryId: active });
        setRowsRevision(revision => revision + 1);
        if (result.listScopeVersion !== 1) setError('Restart the local app to use the new list filters and Run choices.');
      }
    } catch (error) {
      if (request === rowsRequest.current) setRowsError(error.message);
    } finally {
      if (request === rowsRequest.current) setRowsLoading(false);
    }
  }, [active, query, status, companyTypes, locations, page, sort, direction]);
  const refresh = async () => {
    await Promise.all([loadBoot(), loadRows()]);
  };
  useEffect(() => {
    loadBoot().catch((e) => setError(e.message));
  }, [loadBoot]);
  useEffect(() => {
    rowsRequest.current++;
    setRowsLoading(true);
    const timer = setTimeout(
      () => loadRows().catch((e) => setError(e.message)),
      160,
    );
    return () => clearTimeout(timer);
  }, [loadRows]);
  const activeNativeRun = boot?.runs?.find(r => r.native === true && r.status === 'running');
  const hasActiveRun = Boolean(activeNativeRun);
  const updateRun = useCallback(run => {
    const { targets, companyIds, brief, ...fields } = run;
    setBoot(previous => {
      if (!previous) return previous;
      const old = previous.runs.find(item => item.id === run.id);
      const summary = {
        ...old, ...fields,
        total: run.total ?? companyIds?.length ?? old?.total ?? 0,
        appliedCount: targets?.filter(target => target.status === 'applied').length ?? run.appliedCount ?? old?.appliedCount ?? 0,
        directoryName: old?.directoryName || previous.directories.find(item => item.id === run.directoryId)?.name || '',
        currentName: targets?.find(target => target.companyId === run.activeCompanyId)?.name ?? run.currentName ?? old?.currentName ?? '',
      };
      return { ...previous, runs: old ? previous.runs.map(item => item.id === run.id ? summary : item) : [summary, ...previous.runs] };
    });
    setModal(previous => previous?.type === 'run' && (!previous.run || previous.run.id === run.id) ? { ...previous, run } : previous);
  }, []);
  const runPollingError = useRunUpdates({
    run: activeNativeRun || (modal?.type === 'run' ? modal.run : null),
    api, onUpdate: updateRun, onFinished: refresh,
  });
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.hidden ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      )
        return;
      if (!hasActiveRun) loadBoot().catch(() => {});
      loadRows().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [loadBoot, loadRows, hasActiveRun]);
  useEffect(() => {
    localStorage.setItem("apply-directory", active);
    setSelected(new Set());
    setPage(0);
    setData({ items: [], total: 0, statusCounts: {} });
  }, [active]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [query, status, companyTypes, locations]);
  useEffect(() => {
    if (!active) { setSelectedPreview(null); return; }
    let current = true;
    setSelectedPreview(null);
    const previewInput = { ...JSON.parse(runScopeKey), actions: { applyMatchingJobs: true, createProfiles: true, sendCvEmails: false } };
    const previewJson = JSON.stringify(previewInput);
    const read = previewJson.length <= 6000 ? api('/run-preview?scope=' + encodeURIComponent(previewJson)) : api('/run-preview', 'POST', previewInput);
    read.then(result => {
      if (current && result.listScopeVersion === 1 && Number.isInteger(result.count)) setSelectedPreview({ scopeKey: runScopeKey, count: result.count });
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [runScopeKey, rowsRevision]);
  useEffect(() => {
    localStorage.setItem(
      "apply-view-" + active,
      JSON.stringify({ query, status, companyTypes, locations, sort, direction }),
    );
  }, [active, query, status, companyTypes, locations, sort, direction]);
  function action(key, fn) {
    if (actionsInFlight.current.has(key)) return actionsInFlight.current.get(key);
    setBusy(key);
    setError("");
    const promise = Promise.resolve().then(fn).catch(e => {
      setError(e.message);
      throw e;
    }).finally(() => {
      actionsInFlight.current.delete(key);
      setBusy(current => current === key ? "" : current);
    });
    actionsInFlight.current.set(key, promise);
    return promise;
  }
  const perform = (key, fn) => action(key, fn).catch(() => {});
  async function updateCompany(c, patch) {
    try {
      const updated = await api("/companies/" + c.id, "PATCH", {
        ...patch,
        expectedRevision: c.revision,
      });
      setData((d) => {
        const previous = d.items.find((row) => row.id === updated.id);
        const counts = { ...d.statusCounts };
        if (previous && previous.status !== updated.status) {
          counts[previous.status] = Math.max(
            0,
            (counts[previous.status] || 0) - 1,
          );
          counts[updated.status] = (counts[updated.status] || 0) + 1;
        }
        const items = d.items
          .map((row) => (row.id === updated.id ? updated : row))
          .filter(
            (row) => !Object.hasOwn(LABELS, status) || row.status === status,
          );
        return {
          ...d,
          statusCounts: counts,
          items,
          total: d.total - (d.items.length - items.length),
        };
      });
      const previousValues = Object.fromEntries(
        Object.keys(patch)
          .filter((key) => key !== "expectedRevision")
          .map((key) => [key, c[key] ?? (["careersPageStatus", "profileSupport"].includes(key) ? "unknown" : key === "routeEvidence" ? "" : null)]),
      );
      notify(
        t("Saved"),
        patch.archived
          ? null
          : {
              type: "edit",
              id: c.id,
              patch: previousValues,
              revision: updated.revision,
            },
      );
      loadRows().catch(() => {});
      return updated;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }
  async function openDetail(c, focusField = null, initialTab = "details") {
    const request = ++detailRequest.current;
    try {
      const record = await api("/companies/" + c.id);
      if (request === detailRequest.current)
        setDetail({ ...record, focusField, initialTab });
    } catch (e) {
      if (request === detailRequest.current) setError(e.message);
    }
  }
  async function archiveDirectory() {
    await api("/directories/" + active, "PATCH", { archived: true });
    await loadBoot();
    setModal(null);
    notify("Directory archived", { type: "directory", id: active });
  }
  function toggleSelected(id) {
    setSelected((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const email = boot?.connections.find((c) => c.kind === "email"),
    cv = boot?.connections.find((c) => c.kind === "tabbio");
  const count = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
  const hasFilters = Boolean(query || status || companyTypes.length || locations.length);
  if (!boot)
    return (
      <div className="loading">
        <TawdheefMark size={64} busy={!error} />
        <p>{error || "Opening your tracker…"}</p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </div>
    );
  const toastContent = toast && (
        <div className="toast" role="status"
          onPointerEnter={e => { if (e.pointerType === 'mouse') { toastInteraction.current.hovered = true; pauseToast(); } }}
          onPointerLeave={() => { toastInteraction.current.hovered = false; resumeToast(); }}
          onFocusCapture={() => { toastInteraction.current.focused = true; pauseToast(); }}
          onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) { toastInteraction.current.focused = false; resumeToast(); } }}>
          <Check size={17} />
          {toast}
          {undo && (
            <button
              onClick={() =>
                perform("undo", async () => {
                  if (undo.type === "directory")
                    await api("/directories/" + undo.id, "PATCH", {
                      archived: false,
                    });
                  else if (undo.type === "edit")
                    await api("/companies/" + undo.id, "PATCH", {
                      ...undo.patch,
                      expectedRevision: undo.revision,
                    });
                  else
                    await api("/companies/" + undo.id, "PATCH", {
                      archived: false,
                    });
                  setUndo(null);
                  await refresh();
                  notify(t("Restored"));
                })
              }
            >
              <Undo2 size={14} />
              {t("Undo")}
            </button>
          )}
        </div>
      );
  return (
    <ModalNotification.Provider value={toastScope === overlayKey ? toastContent : null}>
      <WorkspaceBackground />
      <header className="app-header">
        <a className="brand" href="/" aria-label={lang === "ar" ? "توظيف — الرئيسية" : "Tawdheef home"}>
          <TawdheefBrand language={lang} />
        </a>
        <div className="header-actions">
          <button data-connections-trigger className="connection" onClick={() => setModal({ type: 'connections' })}><Plug />{t('Connections')}<span className={'connection-dot ' + (boot.nativeClient?.assistant === boot.settings.preferredAssistant && boot.nativeClient?.capabilities?.assistant?.localToolUseObserved === true && boot.nativeClient.capabilities.assistant.status === 'reported' ? 'online' : '')} /></button>
          <span className="header-divider" />
          <button
            className="icon-button"
            aria-label={t("Settings")}
            title={t("Settings")}
            onClick={() => setModal({ type: "settings" })}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>
      <main className="workspace">
        <nav className="directory-tabs" aria-label="Directories">
          <div
            className="tab-list"
            role="tablist"
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const tabs = [...e.currentTarget.querySelectorAll("[role=tab]")];
              const current = tabs.indexOf(document.activeElement);
              const step =
                (e.key === "ArrowRight" ? 1 : -1) * (lang === "ar" ? -1 : 1);
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? tabs.length - 1
                    : (current + step + tabs.length) % tabs.length;
              tabs[next]?.focus();
              tabs[next]?.click();
            }}
          >
            {boot.directories.map((d) => (
              <button
                key={d.id}
                role="tab"
                id={"tab-" + d.id}
                aria-controls={"directory-" + d.id}
                tabIndex={active === d.id ? 0 : -1}
                aria-selected={active === d.id}
                className="directory-tab"
                onClick={() => chooseDirectory(d.id)}
              >
                <Flag value={d.flag} />
                {d.name}
                <span className="tab-count">{d.count}</span>
              </button>
            ))}
          </div>
          <button
            className="add-directory"
            onClick={event => { event.currentTarget.focus(); setModal({ type: "directory" }); }}
          >
            <Plus />
            {t("Add directory")}
          </button>
        </nav>
        <section className="directory-heading">
          <div>
            <h1>
              {directory?.name || "Your directory"}
              <button
                className="icon-button subtle"
                aria-label={t("Customize directory")}
                onClick={() => setModal({ type: "directory", edit: directory })}
              >
                <MoreHorizontal />
              </button>
            </h1>
            <p>{t('Find matching jobs and build career profiles.')}</p>
          </div>
          <div className="heading-actions">
            <button
              className="primary directory-run"
              disabled={!directory || (!activeNativeRun && (filterPending || rowsLoading || !!rowsError || !rowsCurrent || runCount == null || runCount === 0))}
              onClick={() => setModal({ type: "run", ...(activeNativeRun ? { run: activeNativeRun } : {}) })}
            >
              <Play size={15} />
              <span>{activeNativeRun ? "View progress" : runLabel}</span>
            </button>
          </div>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle />
            <span>{error}</span>
            <button
              aria-label="Dismiss error"
              className="icon-button"
              onClick={() => setError("")}
            >
              <X />
            </button>
          </div>
        )}
        {(activeNativeRun || boot.runs.find(r => r.native === true && r.directoryId === active)) && (() => {
          const run = activeNativeRun || boot.runs.find(r => r.native === true && r.directoryId === active);
          return <RunProgress run={run} open={() => setModal({ type: 'run', run })} stop={() => perform('stop-run', async () => { updateRun(await api(`/runs/${run.id}/stop`, 'POST')); await refresh(); })} />;
        })()}
        {directory && <section className="directory-overview" aria-label={t('Progress and monitoring')}><DirectorySnapshot
          directoryId={active}
          directoryName={directory.name}
          revision={`${rowsRevision}:${activeNativeRun?.id || ''}:${activeNativeRun?.completed ?? ''}`}
          timeZone={boot.settings.timezone}
          locale={lang}
          api={api}
          Dialog={Modal}
          t={t}
          onOpenCompany={companyId => openDetail({ id: companyId }, null, 'applications')}
        /><MonitoringSummary config={boot.monitoring?.config} status={boot.monitoring?.status} error={boot.monitoring?.error} t={t} open={() => setModal({ type: 'monitoring' })} /></section>}
        {directory && <DiscoveryPanel directoryId={active} directoryName={directory.name} revision={rowsRevision} assistant={boot.settings.preferredAssistant} t={t} />}
        <div
          className="table-surface"
          id={"directory-" + active}
          role="tabpanel"
          aria-labelledby={"tab-" + active}
        >
          <div className="table-toolbar">
            <div className="table-filters">
              <label className="search">
                <Search />
                <input
                  aria-label={t("Search companies")}
                  placeholder={t("Search companies")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    className="clear-search"
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              {directory && <CompanyFilters directory={directory} facets={data._directoryId === active ? data.facets : null} companyTypes={companyTypes} locations={locations} onCompanyTypesChange={setCompanyTypes} onLocationsChange={setLocations} onPendingChange={setFilterPending} t={t} pending={!!busy} />}
              <label className="status-filter">
                <span>{t("Status")}</span>
                <select
                  aria-label={t("Application status")}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">
                    {t("All statuses")} ({count})
                  </option>
                  {Object.entries(LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {t(label)} ({data.statusCounts[key] || 0})
                    </option>
                  ))}
                  <optgroup label={t("Needs attention")}>
                    <option value="needs_you">
                      {t("Needs you")} ({data.attentionCounts?.needsYou || 0})
                    </option>
                    <option value="follow_up_due">
                      {t("Follow-ups due")} (
                      {data.attentionCounts?.followUpDue || 0})
                    </option>
                  </optgroup>
                </select>
              </label>
            </div>
            <div className="table-tools">
              <button
                className="add-company"
                disabled={!directory}
                onClick={() => setModal({ type: "company" })}
              >
                <Plus />
                {t("Add company")}
              </button>
              {directory && (
                <ListOptions
                  onColumns={() => setModal({ type: "columns" })}
                  onImport={() => setModal({ type: "import" })}
                  onPacks={() => setModal({ type: 'packs', directory })}
                  exportUrl={"/api/export/" + active}
                  t={t}
                />
              )}
            </div>
          </div>
          {selected.size > 0 && (
            <div className="selection-toolbar">
              <span>
                {selected.size} {t("selected")}
              </span>
              <label>
                Set status{" "}
                <select
                  aria-label="Set selected company statuses"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const value = e.target.value;
                    perform("bulk", async () => {
                      for (const id of selected) {
                        const row = await api("/companies/" + id);
                        await api("/companies/" + id, "PATCH", {
                          status: value,
                          expectedRevision: row.company.revision,
                        });
                      }
                      setSelected(new Set());
                      await loadRows();
                      notify("Statuses updated");
                    });
                  }}
                >
                  <option value="">Choose status</option>
                  {Object.entries(LABELS).map(([s, l]) => (
                    <option key={s} value={s}>
                      {t(l)}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </div>
          )}
          <div
            className="table-scroll"
            aria-busy={rowsLoading}
            tabIndex={0}
            role="region"
            aria-label="Company list"
          >
            <table>
              <thead>
                <tr>
                  <th className="check-column">
                    <input
                      type="checkbox"
                      aria-label={t("Select all visible companies")}
                      checked={
                        data.items.length > 0 &&
                        data.items.every((c) => selected.has(c.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(data.items.map((c) => c.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  {columns.map((key) => (
                    <th
                      key={key}
                      className={"col-" + key}
                      aria-sort={
                        key === "name" && sort === "name"
                          ? direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {key === "name" ? (
                        <button
                          className="column-sort"
                          onClick={() => {
                            setSort("name");
                            setDirection((d) => (d === "asc" ? "desc" : "asc"));
                          }}
                        >
                          {t("Company")}
                          <ArrowUpDown size={13} />
                        </button>
                      ) : (
                        t(FIELDS[key] || key)
                      )}
                    </th>
                  ))}
                  <th className="row-more" aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {rowsLoading &&
                  !data.items.length &&
                  Array.from({ length: 6 }, (_, i) => (
                    <tr
                      key={"loading-" + i}
                      className="skeleton-row"
                      aria-hidden="true"
                    >
                      <td colSpan={columns.length + 2}>
                        <span />
                        <span />
                        <span />
                      </td>
                    </tr>
                  ))}
                {data.items.map((c) => (
                  <tr
                    key={c.id}
                    className={selected.has(c.id) ? "selected-row" : ""}
                  >
                    <td className="check-column">
                      <input
                        type="checkbox"
                        aria-label={"Select " + c.name}
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelected(c.id)}
                      />
                    </td>
                    {columns.map((key) => (
                      <td key={key} className={"col-" + key}>
                        {key === "name" ? (
                          <button
                            className="company-name"
                            onClick={() => openDetail(c)}
                          >
                            <span className="company-label">
                              <strong>{c.name}</strong>
                              <span>
                                {c.sourceRole ||
                                  c.sector ||
                                  c.location ||
                                  "Company"}
                              </span>
                            </span>
                          </button>
                        ) : key === "status" ? (
                          <div className="status-cell">
                            <select
                              className={"status-select " + c.status}
                              aria-label={"Status for " + c.name}
                              value={c.status}
                              onChange={(e) =>
                                updateCompany(c, {
                                  status: e.target.value,
                                }).catch(() => {})
                              }
                            >
                              {Object.entries(LABELS).map(([s, l]) => (
                                <option key={s} value={s}>
                                  {t(l)}
                                </option>
                              ))}
                            </select>
                            {c.attention && (
                              <span
                                title={
                                  c.attention === "needs_you"
                                    ? "Needs you"
                                    : "Update failed"
                                }
                              >
                                <AlertCircle
                                  className="attention-icon"
                                  size={14}
                                />
                              </span>
                            )}
                          </div>
                        ) : key === "progress" ? (
                          <CompanyProgress company={c} t={t} open={() => openDetail(c, null, "applications")} />
                        ) : key === "careersUrl" ? (
                          <Contacts
                            company={c}
                            t={t}
                            edit={(field) => openDetail(c, field)}
                          />
                        ) : key === "linkedinUrl" ? (
                          safeHref(c.linkedinUrl) ? (
                            <a
                              className="careers-link"
                              href={safeHref(c.linkedinUrl)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <BrandIcon brand="linkedin" />
                              LinkedIn
                              <ExternalLink size={13} />
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )
                        ) : ["sourceRole", "routeStatus", "type"].includes(key) ? (
                          <span className="source-value" title={c[key]}>
                            {c[key] || "—"}
                          </span>
                        ) : key === "lastUpdate" ? (
                          c.lastUpdate ? (
                            <button
                              className="date-cell date-link"
                              title={c.lastUpdate}
                              aria-label={"View activity for " + c.name}
                              onClick={() =>
                                openDetail(c, null, "applications")
                              }
                            >
                              {formatDate(c.lastUpdate)}
                            </button>
                          ) : (
                            <span
                              className="date-cell muted"
                              title={t("No update yet")}
                            >
                              —
                            </span>
                          )
                        ) : (
                          <Editable
                            value={c[key] || ""}
                            label={`${FIELDS[key]} for ${c.name}`}
                            placeholder={
                              key === "notes" ? t("Add a note") : "—"
                            }
                            display={key === "nextAction" ? t(c[key]) : null}
                            onSave={(value) =>
                              updateCompany(c, { [key]: value })
                            }
                          />
                        )}
                      </td>
                    ))}
                    <td className="row-more">
                      <button
                        className="icon-button subtle"
                        aria-label={t("Details") + " " + c.name}
                        onClick={() => openDetail(c)}
                      >
                        <MoreHorizontal />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rowsLoading && !data.items.length && (
              <span className="sr-only" role="status">
                {t("Loading companies…")}
              </span>
            )}
            {!rowsLoading && rowsError && <div className="empty" role="alert"><AlertCircle size={28}/><h3>{t('Company list unavailable')}</h3><p>{rowsError}</p><button onClick={() => { setRowsLoading(true); loadRows(); }}>{t('Try again')}</button></div>}
            {!rowsLoading && !rowsError && !data.items.length && (
              <div className="empty">
                {directory ? <Search size={28} /> : <FolderOpen size={28} />}
                <h3>
                  {!directory
                    ? "Add your first directory"
                    : count === 0 && !hasFilters
                      ? "This directory is empty"
                      : t("No companies found")}
                </h3>
                <p>
                  {!directory
                    ? "Create a tab for your company list."
                    : count === 0 && !hasFilters
                      ? "Add a company or import a list to get started."
                      : t("Try another search or add a company.")}
                </p>
                {!directory ? (
                  <button onClick={() => setModal({ type: "directory" })}>
                    <Plus />
                    {t("Add directory")}
                  </button>
                ) : count === 0 && !hasFilters ? (
                  <button onClick={() => setModal({ type: "import" })}>
                    <Upload />
                    {t("Import list")}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setQuery(""); setStatus(""); setCompanyTypes([]); setLocations([]); setSelected(new Set()); setPage(0);
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
          <footer className="table-footer">
            <span>
              {rowsError ? t('Company list unavailable') : rowsLoading && !data.items.length ? 'Loading…' : data.total
                ? `${page * 100 + 1}–${Math.min((page + 1) * 100, data.total)} of ${data.total.toLocaleString()}`
                : "0 results"}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label={t("Previous")}
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
              </button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(data.total / 100))}
              </span>
              <button
                className="icon-button"
                aria-label={t("Next")}
                disabled={(page + 1) * 100 >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight />
              </button>
            </div>
          </footer>
        </div>
        <footer className="workspace-footer">
          <span className="community-credit"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20C8 17 2 12 3 7c1-5 7-4 9 0 3-5 9-5 9 1 0 4-5 9-9 12Z"/><path d="M5 7c0-1 1-2 2-2"/></svg><a href="https://github.com/ahmedaldhraif/tawdheef" target="_blank" rel="noreferrer"><Github size={13} aria-hidden="true"/>{t('Open source')}</a><span>{t('by')} <a href="https://github.com/ahmedaldhraif" target="_blank" rel="noreferrer" title="Ahmed AlDhraif">@ahmedaldhraif</a></span><a href="https://github.com/ahmedaldhraif/tawdheef/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer">{t('Contribute')}</a></span>
          <span>
            <ShieldCheck size={14} />
            {t("Saved on this computer")}
          </span>
          <span>
            {active === "uae" && (
              <>
                Source snapshot: 10 Nov 2026 <span className="footer-dot" />
              </>
            )}
            <span className="update-status">{t('Updates stay in your assistant')}</span>
          </span>
        </footer>
      </main>
      {!modal && !detail && toastContent}
      {modal?.type === 'packs' && (
        <DirectoryPacksDialog
          api={api} Modal={Modal} t={t} language={lang}
          directory={modal.directory}
          close={() => setModal(null)}
          createEmpty={() => setModal({ type: 'directory' })}
          installed={async result => {
            chooseDirectory(result.directoryId);
            await refresh();
            setModal(null);
            notify(t('Directory added'));
          }}
        />
      )}
      {modal?.type === "directory" && (
        <DirectoryDialog
          t={t}
          edit={modal.edit}
          close={() => setModal(null)}
          onArchive={archiveDirectory}
          browse={() => setModal({ type: 'packs' })}
          save={async (values) => {
            await api(
              "/directories" + (modal.edit ? "/" + modal.edit.id : ""),
              modal.edit ? "PATCH" : "POST",
              values,
            ).then((d) => chooseDirectory(d.id));
            await refresh();
            setModal(null);
            notify(modal.edit ? "Directory updated" : "Directory added");
          }}
        />
      )}
      {modal?.type === "company" && (
        <CompanyDialog
          t={t}
          close={() => setModal(null)}
          save={async (values) => {
            await api("/directories/" + active + "/companies", "POST", {
              records: [values],
            });
            await refresh();
            setModal(null);
            notify("Company added");
          }}
        />
      )}
      {modal?.type === "columns" && (
        <Modal title={t("Columns")} close={() => setModal(null)} t={t} narrow>
          <p className="dialog-intro">Choose what appears in this directory.</p>
          <div className="check-list">
            {Object.entries(FIELDS).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={columns.includes(key)}
                  disabled={key === "name"}
                  onChange={() =>
                    perform("columns", async () => {
                      const next = columns.includes(key)
                        ? columns.filter((k) => k !== key)
                        : [...columns, key];
                      await api("/directories/" + active, "PATCH", {
                        columns: next,
                      });
                      await loadBoot();
                    })
                  }
                />
                {t(label)}
              </label>
            ))}
          </div>
        </Modal>
      )}
      {modal?.type === "import" && (
        <ImportDialog
          t={t}
          directory={directory}
          close={() => setModal(null)}
          save={async (records) => {
            const result = await api(
              "/directories/" + active + "/companies",
              "POST",
              { records },
            );
            await refresh();
            setModal(null);
            notify(`${result.added} added, ${result.updated} updated`);
          }}
        />
      )}
      {(modal?.type === 'settings' || modal?.type === 'monitoring') && (
        <SettingsDialog
          section={modal.type === 'monitoring' ? 'monitoring' : 'preferences'}
          openJobPreferences={modal.focus === 'job-preferences'}
          clientStatus={boot.nativeClient}
          draftRef={settingsDraft}
          monitoringScope={runScope}
          onOpenConnections={() => setModal({ type: 'connections', returnTo: modal })}
          onOpenCompany={async id => { setModal(null); await openDetail({ id }); }}
          reports={boot.reports}
          generateReport={async () => {
            const result = await api("/reports", "POST", {});
            await loadBoot();
            return result;
          }}
          t={t}
          settings={boot.settings}
          close={() => { settingsDraft.current = null; setModal(modal.returnTo || null); }}
          save={async (values) => {
            const keys = ['timezone', 'language'];
            await api(
              "/settings",
              "PATCH",
              Object.fromEntries(keys.map((key) => [key, values[key]])),
            );
            await loadBoot().catch(() => {});
            settingsDraft.current = null;
            setModal(modal.returnTo || null);
            notify(t("Saved"));
            await loadRows().catch(() => {});
          }}
        />
      )}
      {modal?.type === 'connections' && <ConnectionsHub api={api} settings={boot.settings} clientStatus={boot.nativeClient}
        onOpenJobPreferences={() => setModal({ type: 'settings', focus: 'job-preferences', returnTo: modal })}
        onCopyConnectionRequest={(kind, options = {}) => api(`/native/connection-request?${new URLSearchParams({ kind, assistant: options.assistant || boot.settings.preferredAssistant || 'codex', ...(options.provider ? { provider: options.provider } : {}) })}`)}
        onSettingsChange={async patch => {
          const saved = await api('/settings', 'PATCH', patch);
          setBoot(previous => ({ ...previous, settings: { ...previous.settings, ...saved } }));
          await loadBoot().catch(() => {});
          return saved;
        }}
        Modal={Modal} t={t} close={() => setModal(modal.returnTo || null)} />}
      {modal?.type === "run" && directory && (
        <RunDialog
          settings={boot.settings}
          clientStatus={boot.nativeClient}
          draftRef={nativeRunDraft}
          preferredAssistant={boot.settings.preferredAssistant}
          onChangeAssistant={() => setModal({ type: 'connections', returnTo: modal })}
          onOpenConnections={() => setModal({ type: 'connections', returnTo: modal })}
          t={t}
          directory={directory}
          selected={selected}
          scope={runScope}
          scopeLabels={{ locationLabels: locations.map(id => data.facets?.locations?.find(item => item.id === id)?.label || id.replace(/^location:/, '')), companyTypeLabels: companyTypes.map(id => data.facets?.companyTypes?.find(item => item.id === id)?.label || id) }}
          run={modal.run}
          onRunUpdate={updateRun}
          pollingError={runPollingError}
          close={() => { nativeRunDraft.current = null; setModal(null); }}
          notify={notify}
          api={api}
          Modal={Modal}
          stopped={refresh}
          onStartNative={async (instructions, assistant, actions) => {
            const value = await api('/native/runs', 'POST', { assistant, ...runScope, actions, instructions, mode: 'send_and_submit', explicit: true });
            nativeRunDraft.current = null;
            updateRun(value.run || value);
            await refresh().catch(() => {}); return value;
          }}
          onCopyHandoff={run => api(`/native/runs/${encodeURIComponent(run.id)}/request`, 'POST', {})}
          onResumeNative={async (run, companyId) => {
            const value = await api(`/native/runs/${encodeURIComponent(run.id)}/resume`, 'POST', { companyId, assistant: run.assistant, explicit: true });
            updateRun(value.run || value);
            setModal({ type: 'run', run: value.run || value });
            await refresh().catch(() => {});
            return value;
          }}

        />
      )}
      {detail && (
        <DetailPanel
          key={detail.company.id}
          pending={busy === 'undo'}
          detail={detail}
          discovery={{ directoryId: active, directoryName: directory?.name, revision: rowsRevision, assistant: boot.settings.preferredAssistant, enabled: true }}
          t={t}
          close={() => {
            detailRequest.current++;
            setDetail(null);
          }}
          save={async (patch) => {
            const c = await updateCompany(detail.company, patch);
            setDetail({ ...detail, company: c });
          }}
          archive={async () => {
            await updateCompany(detail.company, { archived: true });

            setDetail(null);
            await refresh();
            notify("Company archived", {
              type: "company",
              id: detail.company.id,
            });
          }}
        />
      )}
    </ModalNotification.Provider>
  );
}

function DirectoryDialog({ edit, t, close, save, onArchive, browse }) {
  const [v, setV] = useState({
    name: edit?.name || "",
    flag: edit?.flag || "icon:folder",
    country: edit?.country || "",
    ...(edit ? { order: edit.order } : {}),
  });
  const originalDirectory = useRef(JSON.stringify(v));
  return (
    <Modal
      title={t(edit ? "Customize directory" : "Add directory")}
      close={close}
      t={t}
      narrow
      dirty={JSON.stringify(v) !== originalDirectory.current}
    >
      {!edit && browse && <button type="button" className="directory-pack-shortcut" onClick={browse}><Download size={16}/>{t('Browse community packs')}</button>}
      <Form
        t={t}
        trackDirty={false}
        close={close}
        save={() => save(v)}
        label={edit ? "Save changes" : "Create directory"}
        extra={
          edit && (
            <button
              type="button"
              className="danger-text push-left"
              onClick={onArchive}
            >
              <Trash2 />
              {t("Archive directory")}
            </button>
          )
        }
      >
        <label>
          {t("Directory name")}
          <input
            required
            maxLength={80}
            autoComplete="off"
            placeholder="e.g. Saudi Arabia, My shortlist"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </label>
        <DirectorySymbolPicker
          value={v.flag}
          onChange={(flag) => {
            const symbol = getDirectorySymbol(flag);
            setV((previous) => ({
              ...previous,
              flag,
              ...(symbol.type === "country"
                ? {
                    country: symbol.englishLabel || symbol.label,
                    ...(!previous.name.trim() ? { name: symbol.label } : {}),
                  }
                : {}),
            }));
          }}
          t={t}
        />
        {edit && (
          <label>
            Tab position
            <input
              type="number"
              min="0"
              value={v.order}
              onChange={(e) => setV({ ...v, order: Number(e.target.value) })}
            />
          </label>
        )}
      </Form>
    </Modal>
  );
}
function CompanyDialog({ t, close, save }) {
  const [v, setV] = useState({
    name: "",
    website: "",
    careersUrl: "",
    linkedinUrl: "",
    email: "",
    sector: "",
  });
  return (
    <Modal title={t("Add company")} close={close} t={t}>
      <Form t={t} close={close} save={() => save(v)} label="Add company">
        {[
          ["name", "Company"],
          ["website", "Website"],
          ["careersUrl", "Careers page"],
          ["linkedinUrl", "LinkedIn"],
          ["email", "Careers email"],
          ["sector", "Sector"],
        ].map(([key, l]) => (
          <label key={key}>
            {t(l)}
            <input
              type={
                key === "email"
                  ? "email"
                  : ["careersUrl", "website", "linkedinUrl"].includes(key)
                    ? "url"
                    : "text"
              }
              required={key === "name"}
              value={v[key]}
              onChange={(e) => setV({ ...v, [key]: e.target.value })}
            />
          </label>
        ))}
      </Form>
    </Modal>
  );
}
function ImportDialog({ t, directory, close, save }) {
  const [file, setFile] = useState(null),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function review() {
    setBusy(true);
    setError("");
    try {
      let content;
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let raw = "";
        for (let i = 0; i < bytes.length; i += 8192)
          raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
        content = btoa(raw);
      } else content = btoa(unescape(encodeURIComponent(csv)));
      setPreview(
        await api("/import/preview", "POST", {
          filename: file?.name || "pasted.csv",
          content,
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t("Import") + " · " + directory.name}
      close={close}
      t={t}
      pending={busy}
      dirty={Boolean(file || csv)}
    >
      <p className="dialog-intro">
        Add a CSV or Excel list. Existing source records are updated without
        replacing your tracking notes or statuses.
      </p>
      {!preview ? (
        <>
          <label className="file-drop">
            <Upload size={25} />
            <strong>{file ? file.name : "Choose a CSV or Excel file"}</strong>
            <span>CSV, TSV or XLSX · up to 20 MB</span>
            <input
              aria-label="Import file"
              type="file"
              disabled={busy}
              accept=".csv,.tsv,.xlsx"
              onChange={(e) => {
                setFile(e.target.files[0]);
                setCsv("");
              }}
            />
          </label>
          <label>
            {t("Paste CSV")}
            <textarea
              rows={5}
              placeholder={
                "Company,Careers,Email\nExample,https://example.com/careers,jobs@example.com"
              }
              value={csv}
              disabled={busy}
              onChange={(e) => {
                setCsv(e.target.value);
                setFile(null);
              }}
            />
          </label>
          <div className="form-actions">
            <button type="button" data-modal-close disabled={busy}>{t("Cancel")}</button>
            <button
              className="primary"
              disabled={(!file && !csv) || busy}
              onClick={review}
            >
              {busy ? "Reading…" : t("Review import")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="import-count">
            <Check size={20} />
            {preview.records.length.toLocaleString()} records ready to import
          </p>
          {preview.warnings?.map((w, i) => (
            <p className="notice" key={i}>
              {w}
            </p>
          ))}
          <div className="import-preview">
            {preview.records.slice(0, 5).map((r, i) => (
              <div key={i}>
                <strong>{r.name}</strong>
                <span>{r.sector || r.sourceRole || r.location}</span>
              </div>
            ))}
          </div>
          <Form
            close={close}
            t={t}
            label="Add to directory"
            save={() => save(preview.records)}
          />
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
function SettingsDialog({
  clientStatus,
  t,
  settings,
  close,
  save,
  reports = [],
  generateReport,
  monitoringScope,
  draftRef,
  onOpenConnections,
  onOpenCompany,
  openJobPreferences = false,
  section = 'preferences',
}) {
  const [actionBusy, setActionBusy] = useState(""),
    [actionError, setActionError] = useState(""),
    [saveBusy, setSaveBusy] = useState(false),
    [saveError, setSaveError] = useState(""),
    [latestReport, setLatestReport] = useState(reports[0] || null);
  useEffect(() => {
    setLatestReport(reports[0] || null);
  }, [reports[0]?.id]);
  async function runUpdateAction(name, fn) {
    setActionBusy(name);
    setActionError("");
    try {
      const result = await fn();
      if (name === "report") setLatestReport(result);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setActionBusy("");
    }
  }

  const [v, setV] = useState(draftRef?.current?.values || { ...settings });
  const originalSettings = useRef(settings);
  const draftRetired = useRef(false);
  const [monitor, setMonitor] = useState(draftRef?.current?.monitor || null), [monitorStatus, setMonitorStatus] = useState(null), [monitorError, setMonitorError] = useState(''), [monitorUpdates, setMonitorUpdates] = useState([]);
  const savedMonitor = useRef(null);
  const [monitorRetry, setMonitorRetry] = useState(0);
  const [jobPreferences, setJobPreferences] = useState(draftRef?.current?.jobPreferences || null), [preferencesError, setPreferencesError] = useState('');
  const splitJobValues = text => [...new Set(text.split(/[,\n،]/).map(value => value.trim()).filter(Boolean))];
  const jobPayload = draft => ({ roles: splitJobValues(draft.rolesText), locations: splitJobValues(draft.locationsText), notes: draft.notes || '' });
  const savedJobPayload = saved => ({ roles: saved.roles || [], locations: saved.locations || [], notes: saved.notes || '' });
  function persistDraft(jobs = jobPreferences, currentMonitor = monitor) {
    if (draftRef && !draftRetired.current) draftRef.current = { values: v, monitor: currentMonitor, jobPreferences: jobs };
  }
  function acceptSavedJobs(saved) {
    const next = { revision: saved.revision, rolesText: (saved.roles || []).join(', '), locationsText: (saved.locations || []).join(', '), notes: saved.notes || '', base: saved };
    setJobPreferences(next);
    persistDraft(next);
    return next;
  }
  const [jobsOpen, setJobsOpen] = useState(openJobPreferences), jobsPanel = useRef(null), jobsFocused = useRef(false);
  useEffect(() => {
    if (!openJobPreferences || !jobPreferences || jobsFocused.current) return;
    const field = jobsPanel.current?.querySelector('textarea');
    if (field) { jobsFocused.current = true; field.focus({ preventScroll: true }); }
  }, [openJobPreferences, jobPreferences]);
  useEffect(() => {
    let active = true;
    discoveryApi('/preferences').then(value => {
      if (!active) return;
      const preferences = value.preferences || value;
      setJobPreferences(previous => previous || { revision: preferences.revision, rolesText: (preferences.roles || []).join(', '), locationsText: (preferences.locations || []).join(', '), notes: preferences.notes || '', base: preferences });
    }).catch(error => { if (active) setPreferencesError(error.message); });
    return () => { active = false; };
  }, []);
  async function saveJobPreferences() {
    if (!jobPreferences) return;
    const patch = jobPayload(jobPreferences);
    const base = jobPreferences.base;
    if (JSON.stringify(patch) === JSON.stringify(savedJobPayload(base))) return acceptSavedJobs(base);
    try {
      const value = await discoveryApi('/preferences', 'PATCH', { expectedRevision: jobPreferences.revision, explicit: true, patch });
      const saved = value.preferences || value;
      return acceptSavedJobs(saved);
    } catch (error) {
      if (error.status === 409) throw new Error(t('Preferences changed elsewhere. Your draft is kept. Reopen Settings to compare before saving.'));
      throw error;
    }
  }
  useEffect(() => {
    let active = true;
    setMonitorError('');
    Promise.all([api('/monitoring'), api('/monitoring/updates?limit=10')]).then(([value, updates]) => {
      if (!active) return;
      savedMonitor.current = value.config;
      setMonitor(previous => previous || value.config); setMonitorStatus(value.status); setMonitorUpdates(updates.items || []);
    }).catch(error => { if (active) setMonitorError(error.message); });
    return () => { active = false; };
  }, [monitorRetry]);
  useEffect(() => { persistDraft(); }, [v, monitor, jobPreferences]);
  async function saveMonitor() {
    if (!monitor || !savedMonitor.current) return monitor;
    const prepared = { ...monitor, timezone: v.timezone };
    if (JSON.stringify(prepared) === JSON.stringify(savedMonitor.current)) return prepared;
    const { revision, ...patch } = prepared;
    const value = await api('/monitoring', 'PATCH', { expectedRevision: revision, explicit: true, patch });
    savedMonitor.current = value.config; setMonitor(value.config); setMonitorStatus(value.status);
    return value.config;
  }
  const [background, setBackground] = useState(null),
    [startupBusy, setStartupBusy] = useState(false),
    [startupError, setStartupError] = useState("");
  useEffect(() => {
    api("/background")
      .then(setBackground)
      .catch((e) => setStartupError(e.message));
  }, []);
  async function changeStartup() {
    setStartupBusy(true);
    setStartupError("");
    try {
      await api(
        "/background/install",
        background.startupInstalled ? "DELETE" : "POST",
        {},
      );
      setBackground(await api("/background"));
    } catch (e) {
      setStartupError(e.message);
    } finally {
      setStartupBusy(false);
    }
  }
  const field = (key, value) => setV((s) => ({ ...s, [key]: value }));
  const pending = startupBusy || !!actionBusy || saveBusy;
  const editablePreferences = ['language', 'timezone'];
  const dirtyPreferences = editablePreferences.some(key => (v[key] ?? '') !== (originalSettings.current[key] ?? ''));
  const dirtyMonitoring = Boolean(monitor && savedMonitor.current && JSON.stringify(monitor) !== JSON.stringify(savedMonitor.current));
  const dirtyJobs = Boolean(jobPreferences && JSON.stringify(jobPayload(jobPreferences)) !== JSON.stringify(savedJobPayload(jobPreferences.base)));
  return (
    <Modal
      title={t(section === 'monitoring' ? 'Monitoring' : 'Preferences')}
      dirty={dirtyPreferences || dirtyMonitoring || dirtyJobs}
      close={() => { draftRetired.current = true; close(); }}
      t={t}
      pending={pending}
      footer={<div className="settings-dialog-footer">
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <div className="form-actions">
          <button type="button" data-modal-close disabled={pending}>{t('Cancel')}</button>
          <button type="submit" form="settings-form" className="primary" disabled={pending}>{saveBusy ? 'Saving…' : t('Save changes')}</button>
        </div>
      </div>}
    >
      <form
        id="settings-form"
        onSubmit={async event => {
          event.preventDefault();
          if (pending) return;
          setSaveBusy(true); setSaveError('');
          let savedJobs = jobPreferences, savedMonitoring = monitor;
          try {
            savedJobs = await saveJobPreferences() || jobPreferences;
            savedMonitoring = await saveMonitor() || monitor;
            draftRetired.current = true;
            await save(v);
          } catch (error) {
            draftRetired.current = false;
            persistDraft(savedJobs, savedMonitoring);
            setSaveError(error.message);
          }
          finally { setSaveBusy(false); }
        }}
      >
        <>
            {section === 'preferences' && <details className="advanced discovery-preferences" ref={jobsPanel} open={jobsOpen} onToggle={event => setJobsOpen(event.currentTarget.open)}><summary>{t('Job preferences')}</summary>
              <p className="field-hint">{t('Your assistant uses these preferences with your actual CV.')}</p>
              {preferencesError ? <p role="alert" className="form-error">{t(preferencesError)}</p> : !jobPreferences ? <p role="status" className="field-hint">{t('Loading job preferences…')}</p> : <>
                <label>{t('Roles')}<textarea value={jobPreferences.rolesText} disabled={pending} onChange={event => setJobPreferences(previous => ({ ...previous, rolesText: event.target.value }))} /></label>
                <label>{t('Job locations')}<textarea value={jobPreferences.locationsText} disabled={pending} onChange={event => setJobPreferences(previous => ({ ...previous, locationsText: event.target.value }))} /></label>
                <p className="field-hint">{t('Separate roles or locations with commas or new lines.')}</p>
                <label>{t('Job notes')}<textarea value={jobPreferences.notes} disabled={pending} onChange={event => setJobPreferences(previous => ({ ...previous, notes: event.target.value }))} /></label>
              </>}
            </details>}
            {section === 'monitoring' && <>
            {!monitorError && <MonitoringPanel config={monitor ? { ...monitor, timezone: v.timezone } : monitor} status={monitorStatus} updates={monitorUpdates} pending={pending} preferredAssistant={v.preferredAssistant || settings.preferredAssistant} t={t} safeHref={safeHref}
              onChange={setMonitor}
              onUseCurrentScope={async () => { setActionBusy('scope'); setMonitorError(''); try { const value = await api('/monitoring/scope', 'POST', monitoringScope); setMonitor(previous => ({ ...previous, scope: { ...value.scope, calendarIds: previous.scope.calendarIds } })); } catch (error) { setMonitorError(error.message); } finally { setActionBusy(''); } }}
              onCopyCalendarRequest={() => api(`/native/connection-request?kind=calendar&assistant=${encodeURIComponent(monitor?.assistant || settings.preferredAssistant)}`)}
              calendars={clientStatus?.assistant === monitor?.assistant && clientStatus?.capabilities?.calendar?.status === 'reported' ? (clientStatus.capabilities.calendar.calendarIds || []).map(id => ({ id, name: id })) : []} onOpenConnections={onOpenConnections} onOpenCompany={onOpenCompany}
              onAcknowledge={async update => { await api(`/monitoring/updates/${encodeURIComponent(update.id)}/ack`, 'POST', { expectedRevision: update.revision }); const [value, updates] = await Promise.all([api('/monitoring'), api('/monitoring/updates?limit=10')]); setMonitorStatus(value.status); setMonitorUpdates(updates.items || []); }}
              onCopyRequest={async () => { const config = await saveMonitor(); return api('/monitoring/recipe', 'POST', { configurationRevision: config.revision, assistant: config.assistant }); }} />}
            {monitorError && <div role="alert"><p className="form-error">{t('Monitoring unavailable')}: {monitorError}</p><button type="button" onClick={() => setMonitorRetry(value => value + 1)}>{t('Try again')}</button></div>}
            <details className="advanced reports-replies"><summary>{t('Reports & replies')}</summary>
            <details className="updates-report advanced">
              <summary>{t('Latest report')}</summary>
              {latestReport ? (
                <>
                  <p className="field-hint">
                    {new Date(latestReport.generatedAt).toLocaleString()}
                  </p>
                  {latestReport.since && <p className="field-hint">{t('Activity period')}: {new Date(latestReport.since).toLocaleString()} – {new Date(latestReport.generatedAt).toLocaleString()}</p>}
                  <p className="field-hint">{t('Follow-ups and Needs you show the current state.')}</p>
                  <dl>
                    {[
                      ['accountsCreated', 'Accounts created'],
                      ['profilesCreated', 'Profiles created'],
                      ['cvsUploaded', 'CVs uploaded'],
                      ['cvsSent', 'CVs sent'],
                      ['talentPoolsJoined', 'Talent pools joined'],
                    ].map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd>{latestReport[key] ?? '—'}</dd></div>)}
                    <div>
                      <dt>Applications sent</dt>
                      <dd>{latestReport.applied}</dd>
                    </div>
                    <div>
                      <dt>Replies</dt>
                      <dd>{latestReport.replies}</dd>
                    </div>
                    <div>
                      <dt>Follow-ups due</dt>
                      <dd>{latestReport.followUps?.length || 0}</dd>
                    </div>
                    <div>
                      <dt>Needs you</dt>
                      <dd>{latestReport.needsYou?.length || 0}</dd>
                    </div>
                  </dl>
                  {latestReport.delivery?.status &&
                    latestReport.delivery.status !== "local" && (
                      <p className="field-hint">
                        Report email: {latestReport.delivery.status}
                      </p>
                    )}
                </>
              ) : (
                <p>No reports yet.</p>
              )}
              <button
                type="button"
                disabled={!!actionBusy}
                onClick={() => runUpdateAction("report", generateReport)}
              >
                <FileText />
                {actionBusy === "report"
                  ? "Generating…"
                  : t("Generate report")}
              </button>
            </details>
            </details></>}
            {section === 'preferences' && <section className="settings-preferences">
              <div className="form-row">
                <label>
                  {t("Language")}
                  <select
                    value={v.language}
                    onChange={(e) => field("language", e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </label>
                <label>
                  {t('Time zone')}
                  <input value={v.timezone} placeholder="Asia/Dubai" onChange={e => field('timezone', e.target.value)} />
                </label>
              </div>
              {background?.startupSupported ? (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      disabled={startupBusy}
                      checked={background.startupInstalled}
                      onChange={changeStartup}
                    />
                    {t('Open at sign-in')}
                  </label>
                </>
              ) : (
                <p>
                  {background ? 'Automatic startup is unavailable on this computer.' : 'Loading startup settings…'}
                </p>
              )}
              {startupError && (
                <p role="alert" className="form-error">
                  {startupError}
                </p>
              )}
            </section>}
            {section === 'monitoring' && <p className="field-hint">{t('Scheduled updates need this computer awake and online.')}</p>}
        </>
        {actionError && (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        )}
      </form>
    </Modal>
  );
}
function DetailPanel({ detail, discovery, t, close, save, archive, pending = false }) {
  const c = detail.company;
  useEffect(() => {
    if (detail.focusField)
      document.getElementById("contact-" + detail.focusField)?.focus();
  }, [detail.focusField]);
  const [v, setV] = useState({ ...c }),
    [tab, setTab] = useState(detail.initialTab || "details"),
    [detailBusy, setDetailBusy] = useState(false);
  const detailTabs = ["details", "applications", "source"];
  const editableFields = ["careersPageStatus", "profileSupport", "routeEvidence", "status", "nextAction", "notes", "email", "website", "careersUrl", "linkedinUrl", "followUpAt", "attention"];
  const editValue = (record, key) => record[key] || (['careersPageStatus','profileSupport'].includes(key) ? 'unknown' : '');
  const previousCompany = useRef(c);
  useEffect(() => {
    const old = previousCompany.current;
    setV(current => editableFields.some(key => editValue(current,key) !== editValue(old,key)) ? current : { ...c });
    previousCompany.current = c;
  }, [c]);
  const dirty = editableFields.some(key => editValue(v,key) !== editValue(c,key));
  const detailPending = detailBusy || pending;
  return (
    <Modal title={c.name} close={close} t={t} wide dirty={dirty} pending={detailPending}>
      <div className="detail-tabs" role="tablist" aria-label={t("Company details")}>
        {detailTabs.map((key) => (
          <button
            className={tab === key ? "active" : ""}
            role="tab" id={'detail-tab-' + key} aria-selected={tab === key}
            aria-controls="company-detail-panel" tabIndex={tab === key ? 0 : -1}
            disabled={detailPending} data-detail-tab={key}
            onKeyDown={event => {
              const index = detailTabs.indexOf(key), rtl = document.documentElement.dir === 'rtl';
              let next;
              if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = detailTabs.length - 1;
              else if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + detailTabs.length) % detailTabs.length;
              else if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + detailTabs.length) % detailTabs.length;
              if (next != null) { event.preventDefault(); setTab(detailTabs[next]); event.currentTarget.parentElement.querySelector('[data-detail-tab="' + detailTabs[next] + '"]')?.focus(); }
            }}
            onClick={() => setTab(key)}
            key={key}
          >
            {t(
              key === "details"
                ? "Details"
                : key === "applications"
                  ? "Application history"
                  : "Source details",
            )}
          </button>
        ))}
      </div>
      <div id="company-detail-panel" role="tabpanel" aria-labelledby={"detail-tab-" + tab} tabIndex={0}>
      {tab === "details" ? (
        <>
        {discovery?.enabled && <DiscoveryPanel {...discovery} inline companyId={c.id} t={t} />}
        <Form
          t={t}
          onBusyChange={setDetailBusy}
          pending={pending}
          trackDirty={false}
          close={close}
          save={() =>
            save({
              status: v.status,
              nextAction: v.nextAction,
              notes: v.notes,
              email: v.email,
              website: v.website,
              careersUrl: v.careersUrl,
              careersPageStatus: v.careersPageStatus || "unknown", profileSupport: v.profileSupport || "unknown", routeEvidence: v.routeEvidence || "",
              linkedinUrl: v.linkedinUrl,
              followUpAt: v.followUpAt || null,
              attention: v.attention,
            })
          }
          extra={
            <button
              type="button"
              className="danger-text push-left"
              onClick={archive}
            >
              <Trash2 />
              Archive
            </button>
          }
        >
          <div className="form-row">
            <label>
              {t("Status")}
              <select
                value={v.status}
                onChange={(e) => setV({ ...v, status: e.target.value })}
              >
                {Object.entries(LABELS).map(([s, l]) => (
                  <option value={s} key={s}>
                    {t(l)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Follow-up")}
              <input
                type="date"
                value={v.followUpAt?.slice(0, 10) || ""}
                onChange={(e) => setV({ ...v, followUpAt: e.target.value })}
              />
            </label>
          </div>
          <label>
            {t("Next action")}
            <input
              value={v.nextAction || ""}
              onChange={(e) => setV({ ...v, nextAction: e.target.value })}
            />
          </label>
          <h3>{t("Career routes")}</h3>
          <div className="form-row">{[["careersPageStatus","Careers page availability"],["profileSupport","Account / profile"]].map(([key,label]) => <label key={key}>{t(label)}<select aria-label={t(label)} value={v[key] || "unknown"} onChange={event => setV({...v,[key]:event.target.value})}>{[["unknown","Not checked"],["available","Available"],[key === "careersPageStatus" ? "not_found" : "not_offered",key === "careersPageStatus" ? "No careers page found" : "No account / profile offered"],["needs_check","Needs checking"]].map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>)}</div>
          <label>{t("Source or reason")}<input aria-label={t("Source or reason")} maxLength={2000} value={v.routeEvidence || ""} onChange={event=>setV({...v,routeEvidence:event.target.value})}/></label>
          {c.routesCheckedAt && <p className="field-hint">{t("Last checked")}: {formatDate(c.routesCheckedAt)}</p>}
          <h3 className="contacts-heading">{t("Contacts")}</h3>
          <div className="form-row">
            <label>
              {t("Website")}
              <input
                type="url"
                id={"contact-website"}
                value={v.website || ""}
                onChange={(e) => setV({ ...v, website: e.target.value })}
              />
            </label>
            <label>
              {t("Careers page")}
              <input
                type="url"
                id={"contact-careersUrl"}
                value={v.careersUrl || ""}
                onChange={(e) => setV({ ...v, careersUrl: e.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              {t("LinkedIn")}
              <input
                type="url"
                id={"contact-linkedinUrl"}
                value={v.linkedinUrl || ""}
                onChange={(e) => setV({ ...v, linkedinUrl: e.target.value })}
              />
            </label>
            <label>
              {t("Careers email")}
              <input
                type="email"
                id={"contact-email"}
                value={v.email || ""}
                onChange={(e) => setV({ ...v, email: e.target.value })}
              />
            </label>
          </div>
          <label>
            {t("Notes")}
            <textarea
              rows={4}
              aria-label={t("Notes")}
              value={v.notes || ""}
              onChange={(e) => setV({ ...v, notes: e.target.value })}
            />
          </label>
          {c.attention && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!v.attention}
                onChange={(e) =>
                  setV({ ...v, attention: e.target.checked ? c.attention : "" })
                }
              />
              {t("Needs you")}
            </label>
          )}
        </Form>
        </>
      ) : tab === "applications" ? (
        <>
          <p className="dialog-intro">
            Accounts, career profiles, CVs and confirmed applications are recorded separately.
          </p>
          {detail.sharedHistory && <p className="field-hint">{t('Shared company history from other directories is included.')}</p>}
          {!detail.applications.length && (
            <div className="empty small">
              <Briefcase size={26} />
              <p>{t("No applications yet.")}</p>
            </div>
          )}
          <div className="application-list">
            {detail.applications.map((a) => (
              <article key={a.id}>
                <div>
                  <strong>{a.role || "Application activity"}</strong>
                  <span className="status-badge">
                    {t(PROGRESS_LABELS[a.status] || LABELS[a.status] || a.status.replaceAll("_", " "))}
                  </span>
                </div>
                <p>
                  {a.method} · {formatDate(a.updatedAt)}
                </p>
                {a.originalCompanyId && a.originalCompanyId !== c.id && <p className="field-hint">{a.originalCompanyName} · {a.originalDirectoryName}</p>}
                {a.notes && <p>{a.notes}</p>}
                {a.milestones?.length > 0 && (a.milestones.length > 1 || !PROGRESS_LABELS[a.status]) && <ul className="progress-history" aria-label="Recorded progress">
                  {a.milestones.map((milestone, index) => <li key={`${milestone.event}-${milestone.at}-${index}`}>
                    <span>{t(PROGRESS_LABELS[milestone.event] || milestone.event.replaceAll('_', ' '))}</span>
                    {safeHref(milestone.url) && milestone.url !== a.url && <a href={safeHref(milestone.url)} target="_blank" rel="noreferrer">Career page</a>}
                    <time dateTime={milestone.at} title={milestone.at}>{formatDate(milestone.at)}</time>
                  </li>)}
                </ul>}
                {safeHref(a.url) && <p><a href={safeHref(a.url)} target="_blank" rel="noreferrer">Career page <ExternalLink size={12} aria-hidden="true" /></a></p>}
                {a.providerMessageId && (
                  <p className="field-hint">Receipt: {a.providerMessageId}</p>
                )}
              </article>
            ))}
          </div>
          <h3>{t("Activity")}</h3>
          <div className="activity-list">
            {detail.activity.slice(0, 15).map((a) => (
              <div key={a.id}>
                <span>{formatDate(a.createdAt)}</span>
                <p>{a.detail}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="dialog-intro">
            Imported source information is preserved separately from your
            tracking.
          </p>
          <p><a href="https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml" target="_blank" rel="noreferrer">{t("Suggest a correction")}</a></p>
          <dl className="source-fields">
            <dt>Record ID</dt>
            <dd>{c.sourceId || c.id}</dd>
            <dt>{t("Source checked")}</dt>
            <dd>{formatDate(c.checkedAt)}</dd>
            {Object.entries(c.sourceFields || {}).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>
                  {typeof value === "object"
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </>
      )}
      </div>
    </Modal>
  );
}
function Contacts({ company: c, t, edit }) {
  const email =
    typeof c.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)
      ? c.email
      : null;
  const channels = [
    {
      key: "website",
      label: "Website",
      title: "Open website",
      url: safeHref(c.website),
      Icon: Globe2,
    },
    {
      key: "careers",
      label: "Careers",
      title: "Open careers",
      url: safeHref(c.careersUrl || c.applyUrl),
      Icon: Briefcase,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      title: "Open LinkedIn company page",
      url: safeHref(c.linkedinUrl),
      brand: "linkedin",
      Icon: null,
    },
    {
      key: "email",
      label: "Email",
      title: "Email " + c.name,
      url: email ? "mailto:" + encodeURI(email) : null,
      Icon: Mail,
    },
  ];
  return (
    <div className="contacts-cell" aria-label={"Contacts for " + c.name}>
      {channels.map(({ key, label, title, url, Icon, brand }) =>
        key === "careers" && c.careersPageStatus === "not_found" ? <button key={key} className="contact-link missing" onClick={() => edit("careersUrl")} aria-label={t("No careers page found") + ": " + c.name}>{t("No careers page found")}</button> : url ? (
          <a
            key={key}
            href={url}
            className="contact-link"
            title={key === "email" ? email : url}
            aria-label={title}
            {...(key === "email"
              ? {}
              : { target: "_blank", rel: "noreferrer" })}
          >
            {brand ? <BrandIcon brand={brand} /> : <Icon size={14} />}
            <span>{t(label)}</span>
          </a>
        ) : (
          <button
            key={key}
            className="contact-link missing"
            title={"Add " + label.toLowerCase()}
            aria-label={"Add " + label.toLowerCase() + " for " + c.name}
            onClick={() =>
              edit(
                key === "careers"
                  ? "careersUrl"
                  : key === "linkedin"
                    ? "linkedinUrl"
                    : key,
              )
            }
          >
            <Plus size={12} />
            <span>
              {t("Add")}{" "}
              {t(label) === label && label !== "LinkedIn"
                ? label.toLowerCase()
                : t(label)}
            </span>
          </button>
        ),
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
