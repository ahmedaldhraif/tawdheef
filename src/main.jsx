import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Briefcase,
  Mail,
  Link2,
  Plug,
  Settings as SettingsIcon,
  RefreshCw,
  Plus,
  Search,
  SlidersHorizontal,
  ExternalLink,
  MoreHorizontal,
  X,
  Check,
  Copy,
  Download,
  Upload,
  Clock3,
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
  Linkedin,
} from "lucide-react";
import "./styles.css";
import './workspace-depth.css';
import Flag from "./Flag.jsx";
import BrandIcon from "./BrandIcon.jsx";
import DirectorySymbolPicker from "./DirectorySymbolPicker.jsx";
import { getDirectorySymbol } from "./directory-symbols.js";
import ListOptions from "./ListOptions.jsx";
import ConnectionPanel from "./ConnectionPanel.jsx";
import RunDialog, { RunProgress } from './RunDialog.jsx';
import useRunUpdates from './useRunUpdates.js';
import CompanyFilters from './CompanyFilters.jsx';
import CompanyProgress, { PROGRESS_LABELS } from './CompanyProgress.jsx';
import DirectorySnapshot from './DirectorySnapshot.jsx';
import ConnectionsHub from './ConnectionsHub.jsx';
import WorkspaceBackground from './WorkspaceBackground.jsx';
import CalendarPanel from './CalendarPanel.jsx';
import ProviderLogo from './ProviderLogo.jsx';
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
const ModalBusy = React.createContext(() => {});
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
  progress: "Progress",
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
  "Report schedule": "موعد التقرير",
  Daily: "يومياً",
  Weekly: "أسبوعياً",
  Hourly: "كل ساعة",
  Manual: "يدوياً",
  Off: "متوقف",
  Custom: "مخصص",
  Time: "الوقت",
  "Time zone": "المنطقة الزمنية",
  "Email reports to me": "إرسال التقارير إلى بريدي",
  "Email address": "البريد الإلكتروني",
  "Daily application limit": "الحد اليومي للتقديم",
  Language: "اللغة",
  "Local background service": "الخدمة المحلية في الخلفية",
  Connect: "ربط",
  Disconnect: "فصل",
  "Server address": "عنوان الخادم",
  "Advanced setup": "إعدادات متقدمة",
  "Copy instructions": "نسخ التعليمات",
  "Copy configuration": "نسخ الإعدادات",
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
    [busy, setBusy] = useState(""),
    [rowsLoading, setRowsLoading] = useState(true),
    [error, setError] = useState(""),
    [undo, setUndo] = useState(null);
  const rowsRequest = useRef(0),
    detailRequest = useRef(0),
    toastTimer = useRef(null);
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
  const runCount = selected.size
    ? selectedPreview?.scopeKey === runScopeKey ? selectedPreview.count : null
    : rowsCurrent ? data.remainingCount : null;
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
    const b = await api("/bootstrap");
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
  const runningManagedRun = boot?.runs?.find(r => r.managed && r.status === 'running');
  const hasActiveRun = Boolean(runningManagedRun);
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
    run: runningManagedRun || (modal?.type === 'run' ? modal.run : null),
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
    if (!active || !selected.size) { setSelectedPreview(null); return; }
    let current = true;
    setSelectedPreview(null);
    api('/run-preview', 'POST', JSON.parse(runScopeKey)).then(result => {
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
  async function action(key, fn) {
    setBusy(key);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy("");
    }
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
          .map((key) => [key, c[key] ?? null]),
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
  const connected = (conn) => conn?.status === "connected";
  const count = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
  if (!boot)
    return (
      <div className="loading">
        <TawdheefMark size={64} busy={!error} />
        <p>{error || "Opening your tracker…"}</p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </div>
    );
  return (
    <>
      <WorkspaceBackground />
      <header className="app-header">
        <a className="brand" href="/" aria-label={lang === "ar" ? "توظيف — الرئيسية" : "Tawdheef home"}>
          <TawdheefBrand language={lang} />
        </a>
        <div className="header-actions">
          <button data-connections-trigger className="connection" onClick={() => setModal({ type: 'connections' })}><Plug />{t('Connections')}<span className={'connection-dot ' + (boot.connections.some(connected) ? 'online' : '')} /></button>
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
            onClick={() => setModal({ type: "directory" })}
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
              disabled={!directory || (!runningManagedRun && (filterPending || rowsLoading || !rowsCurrent || runCount == null || runCount === 0))}
              onClick={() => setModal({ type: "run", ...(runningManagedRun ? { run: runningManagedRun } : {}) })}
            >
              <Play size={15} />
              <span>{runningManagedRun ? "View progress" : runLabel}</span>
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
        {(runningManagedRun || boot.runs.find(r => r.managed && r.directoryId === active)) && (() => {
          const run = runningManagedRun || boot.runs.find(r => r.managed && r.directoryId === active);
          return <RunProgress run={run} open={() => setModal({ type: 'run', run })} stop={() => perform('stop-run', async () => { updateRun(await api(`/runs/${run.id}/stop`, 'POST')); await refresh(); })} />;
        })()}
        {directory && <DirectorySnapshot
          directoryId={active}
          directoryName={directory.name}
          revision={`${rowsRevision}:${runningManagedRun?.id || ''}:${runningManagedRun?.completed ?? ''}`}
          timeZone={boot.settings.timezone}
          locale={lang}
          api={api}
          Dialog={Modal}
          t={t}
          onOpenCompany={companyId => openDetail({ id: companyId }, null, 'applications')}
        />}
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
            {!rowsLoading && !data.items.length && (
              <div className="empty">
                {directory ? <Search size={28} /> : <FolderOpen size={28} />}
                <h3>
                  {!directory
                    ? "Add your first directory"
                    : count === 0 && !query && !status
                      ? "This directory is empty"
                      : t("No companies found")}
                </h3>
                <p>
                  {!directory
                    ? "Create a tab for your company list."
                    : count === 0 && !query && !status
                      ? "Add a company or import a list to get started."
                      : t("Try another search or add a company.")}
                </p>
                {!directory ? (
                  <button onClick={() => setModal({ type: "directory" })}>
                    <Plus />
                    {t("Add directory")}
                  </button>
                ) : count === 0 && !query && !status ? (
                  <button onClick={() => setModal({ type: "import" })}>
                    <Upload />
                    {t("Import list")}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setQuery("");
                      setStatus("");
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
              {rowsLoading && !data.items.length ? 'Loading…' : data.total
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
            <span
              className="update-status"
              title={boot.settings.lastRefreshMessage || 'Manage reply checks and reports in Settings'}
            >
              {boot.settings.lastRefreshStatus === "no_threads"
                ? "No applications to check yet"
                : boot.settings.lastRefreshError
                  ? "Reply check needs attention"
                  : boot.settings.lastRefreshAt
                    ? "Last reply check: " +
                      formatDate(boot.settings.lastRefreshAt)
                    : "Replies not checked yet"}
            </span>
          </span>
        </footer>
      </main>
      {toast && (
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
      )}
      {modal?.type === "directory" && (
        <DirectoryDialog
          t={t}
          edit={modal.edit}
          close={() => setModal(null)}
          onArchive={archiveDirectory}
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
      {modal?.type === "settings" && (
        <SettingsDialog
          reports={boot.reports}
          checkReplies={async () => {
            const result = await api("/refresh", "POST", {});
            await loadBoot();
            notify(result.message || "Replies checked");
            return result;
          }}
          generateReport={async () => {
            const result = await api("/reports", "POST", {});
            await loadBoot();
            return result;
          }}
          t={t}
          settings={boot.settings}
          close={() => setModal(null)}
          save={async (values) => {
            const keys = [
                    "refreshFrequency",
                    "reportFrequency",
                    "reportTime",
                    "reportDay",
                    "reportEveryDays",
                    "timezone",
                    "emailReports",
                    "reportEmail",
                    "language",
                  ];
            await api(
              "/settings",
              "PATCH",
              Object.fromEntries(keys.map((key) => [key, values[key]])),
            );
            await loadBoot();
            setModal(null);
            notify(t("Saved"));
          }}
        />
      )}
      {modal?.type === 'connections' && <ConnectionsHub api={api} connections={boot.connections} Modal={Modal} t={t} close={() => setModal(null)} open={(kind, provider) => setModal(kind === 'ai' ? { type: 'ai', client: provider } : { type: 'connection', kind, provider })} />}
      {modal?.type === 'connection' && modal.kind === 'calendar' && <CalendarPanel conn={boot.connections.find(c => c.kind === 'calendar')} provider={modal.provider} api={api} updated={loadBoot} close={() => setModal(null)} back={() => setModal({ type: 'connections' })} notify={notify} Modal={Modal} t={t} safeHref={safeHref} />}
      {modal?.type === "connection" && modal.kind !== 'calendar' && (
        <ConnectionPanel
          api={api}
          Modal={Modal}
          safeHref={safeHref}
          t={t}
          kind={modal.kind}
          conn={boot.connections.find((c) => c.kind === modal.kind && (!modal.provider || c.provider === modal.provider || c.adapter === modal.provider))}
          provider={modal.provider}
         
          back={() => setModal({ type: 'connections' })}
          close={() => {
            setModal(null);
            loadBoot();
          }}
          updated={loadBoot}
          notify={notify}
        />
      )}
      {modal?.type === "ai" && (
        <AIDialog initialClient={modal.client} t={t} close={() => setModal(null)} back={() => setModal({ type: 'connections' })} notify={notify} />
      )}
      {modal?.type === "run" && directory && (
        <RunDialog
          t={t}
          directory={directory}
          selected={selected}
          scope={runScope}
          scopeLabels={{ locationLabels: locations.map(id => data.facets?.locations?.find(item => item.id === id)?.label || id.replace(/^location:/, '')), companyTypeLabels: companyTypes.map(id => data.facets?.companyTypes?.find(item => item.id === id)?.label || id) }}
          run={modal.run}
          onRunUpdate={updateRun}
          pollingError={runPollingError}
          close={() => setModal(null)}
          notify={notify}
          api={api}
          Modal={Modal}
          stopped={refresh}
          start={async (instructions, assistant, actions) => {
            const r = await api("/run", "POST", {
              assistant,
              ...runScope,
              actions,
              instructions,
              mode: "send_and_submit",
              explicit: true,
            });
            await refresh();
            return r;
          }}
        />
      )}
      {detail && (
        <DetailPanel
          key={detail.company.id}
          detail={detail}
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
    </>
  );
}

function Editable({ value, label, placeholder, onSave, display }) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const committed = useRef(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  async function save() {
    if (committed.current) return;
    if (draft === value) {
      setEditing(false);
      return;
    }
    committed.current = true;
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e.message);
      committed.current = false;
    } finally {
      setSaving(false);
    }
  }
  return editing ? (
    <div className="inline-editor">
      <input
        autoFocus
        aria-label={label}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            committed.current = true;
            setDraft(value);
            setEditing(false);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      />
      {error && (
        <span role="alert" className="inline-error">
          {error}
        </span>
      )}
    </div>
  ) : (
    <button
      className={"editable " + (!value ? "placeholder" : "")}
      title={value || label}
      aria-label={"Edit " + label}
      onClick={() => {
        committed.current = false;
        setError("");
        setEditing(true);
      }}
    >
      {display || value || placeholder}
    </button>
  );
}
function Modal({
  title,
  close,
  children,
  t,
  narrow = false,
  wide = false,
  footer,
  pending = false,
}) {
  const ref = useRef(null),
    state = useRef({ close, pending });
  const [saving, setSaving] = useState(false);
  state.current = { close, pending: pending || saving };
  const requestClose = () => {
    if (!state.current.pending) state.current.close();
  };
  useEffect(() => {
    const previous = document.activeElement,
      node = ref.current;
    const items = () =>
      [
        ...node.querySelectorAll(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
        ),
      ].filter((e) => e.getClientRects().length);
    items()[0]?.focus();
    const handle = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!state.current.pending) state.current.close();
      }
      if (e.key === "Tab") {
        const list = items();
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    node.addEventListener("keydown", handle);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node.removeEventListener("keydown", handle);
      document.body.style.overflow = overflow;
      if (previous?.isConnected && previous !== document.body) previous.focus?.();
      else document.querySelector('[data-connections-trigger]')?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <section
        ref={ref}
        className={"dialog " + (narrow ? "narrow " : "") + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-busy={pending || saving}
      >
        <header className="dialog-header">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            aria-label={t("Close")}
            onClick={requestClose}
            disabled={pending || saving}
          >
            <X />
          </button>
        </header>
        <div className="dialog-content">
          <ModalBusy.Provider value={setSaving}>{children}</ModalBusy.Provider>
        </div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </section>
    </div>
  );
}
function Form({
  children,
  save,
  label = "Save changes",
  close,
  t,
  extra,
  pending = false,
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = React.useContext(ModalBusy);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || pending) return;
        setBusy(true);
        lock(true);
        setError("");
        try {
          await save();
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
          lock(false);
        }
      }}
    >
      {children}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        {extra}
        <button type="button" onClick={close} disabled={busy || pending}>
          {t("Cancel")}
        </button>
        <button type="submit" className="primary" disabled={busy || pending}>
          {busy ? "Saving…" : t(label)}
        </button>
      </div>
    </form>
  );
}

function DirectoryDialog({ edit, t, close, save, onArchive }) {
  const [v, setV] = useState({
    name: edit?.name || "",
    flag: edit?.flag || "icon:folder",
    country: edit?.country || "",
    ...(edit ? { order: edit.order } : {}),
  });
  return (
    <Modal
      title={t(edit ? "Customize directory" : "Add directory")}
      close={close}
      t={t}
      narrow
    >
      <Form
        t={t}
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
            <button onClick={close}>{t("Cancel")}</button>
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
  t,
  settings,
  close,
  save,
  reports = [],
  checkReplies,
  generateReport,
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

  const [v, setV] = useState({ ...settings });
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
  return (
    <Modal
      title={t("Settings")}
      close={close}
      t={t}
      pending={pending}
      footer={<div className="settings-dialog-footer">
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <div className="form-actions">
          <button type="button" onClick={close} disabled={pending}>{t('Cancel')}</button>
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
          try { await save(v); } catch (error) { setSaveError(error.message); }
          finally { setSaveBusy(false); }
        }}
      >
        <>
            <p className="field-hint">For all directories.</p>
            <section className="settings-section">
              <div className="settings-update-row">
              <label>
                Check replies
                <select
                  value={v.refreshFrequency}
                  onChange={(e) => field("refreshFrequency", e.target.value)}
                >
                  {["manual", "hourly", "daily", "weekly"].map((f) => (
                    <option value={f} key={f}>
                      {t(f[0].toUpperCase() + f.slice(1))}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" aria-label="Check replies now" disabled={pending} onClick={() => runUpdateAction('replies', checkReplies)}>
                <RefreshCw className={actionBusy === 'replies' ? 'spin' : ''} />
                {actionBusy === 'replies' ? 'Checking…' : 'Check now'}
              </button>
              </div>
              <p className="field-hint">{settings.lastRefreshAt ? `Last check: ${new Date(settings.lastRefreshAt).toLocaleString()}` : 'Not checked yet'}</p>
            </section>
            <section className="settings-section">
              <h3>{t("Report schedule")}</h3>
              <div className="form-row">
                <label>
                  Frequency
                  <select
                    value={v.reportFrequency}
                    onChange={(e) => field("reportFrequency", e.target.value)}
                  >
                    {["off", "daily", "weekly", "custom"].map((f) => (
                      <option value={f} key={f}>
                        {t(f[0].toUpperCase() + f.slice(1))}
                      </option>
                    ))}
                  </select>
                </label>
                {v.reportFrequency !== 'off' && <label>
                  {t("Time")}
                  <input
                    type="time"
                    value={v.reportTime}
                    onChange={(e) => field("reportTime", e.target.value)}
                  />
                </label>}
              </div>
              {v.reportFrequency === "weekly" && (
                <label>
                  Day
                  <select
                    value={v.reportDay}
                    onChange={(e) => field("reportDay", Number(e.target.value))}
                  >
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((day, i) => (
                      <option value={i} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {v.reportFrequency === "custom" && (
                <label>
                  Every how many days?
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={v.reportEveryDays}
                    onChange={(e) =>
                      field("reportEveryDays", Number(e.target.value))
                    }
                  />
                </label>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={v.emailReports}
                  onChange={(e) => field("emailReports", e.target.checked)}
                />
                {t("Email reports to me")}
              </label>
              {v.emailReports && (
                <label>
                  {t("Email address")}
                  <input
                    type="email"
                    required
                    value={v.reportEmail}
                    onChange={(e) => field("reportEmail", e.target.value)}
                  />
                </label>
              )}
            </section>
            <details className="updates-report advanced">
              <summary>Latest report</summary>
              {latestReport ? (
                <>
                  <p className="field-hint">
                    {new Date(latestReport.generatedAt).toLocaleString()}
                  </p>
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
                  : settings.emailReports
                    ? "Generate & email report"
                    : t("Generate report")}
              </button>
            </details>
            <details className="advanced settings-preferences">
              <summary>Preferences</summary>
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
                    Open at Windows sign-in
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
            </details>
            <p className="field-hint">Scheduled updates need this computer awake and online.</p>
        </>
        {actionError && (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        )}
        {settings.lastRefreshError && (
          <p className="notice">Reply check: {settings.lastRefreshError}</p>
        )}
        {settings.lastReportError && (
          <p className="notice">Report: {settings.lastReportError}</p>
        )}
      </form>
    </Modal>
  );
}
function AIDialog({ t, close, back, initialClient, backLabel = 'Back to connections' }) {
  const assistant = initialClient === 'claude' ? 'claude-code' : 'codex';
  const name = assistant === 'codex' ? 'Codex' : 'Claude Code';
  const [report, setReport] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [manualCopy, setManualCopy] = useState(false), [copied, setCopied] = useState(false);
  const setupRequest = report?.setupPrompt ? `Use ${name} for this setup. ${report.setupPrompt}` : '';
  useEffect(() => {
    let active = true;
    setReport(null); setError(''); setCopied(false); setManualCopy(false);
    api('/setup-status?assistant=' + assistant).then(value => { if (active) setReport(value); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [assistant, retry]);
  async function copy() {
    try { await navigator.clipboard.writeText(setupRequest); setCopied(true); setManualCopy(false); }
    catch { setManualCopy(true); }
  }
  return <Modal title={name + ' setup'} close={close} t={t}>
    {back && <button className="text-button" onClick={back}>{backLabel}</button>}
    <p className="assistant-setup-intro"><ProviderLogo provider={assistant} size={28} decorative /><span>Open this app folder in {name}, then paste the setup request.</span></p>
    <div className="assistant-setup-actions">
      <a className="button" href={assistant === 'codex' ? 'https://developers.openai.com/codex/cli/' : 'https://code.claude.com/docs/en/quickstart'} target="_blank" rel="noreferrer">Install {name}</a>
      <button disabled={!report?.setupPrompt} onClick={copy}><Copy size={15} />{copied ? 'Copied' : 'Copy setup request'}</button>
    </div>
    {manualCopy && <label className="assistant-copy-fallback">Copy this request<textarea rows={3} readOnly value={setupRequest} onFocus={event => event.target.select()} /></label>}
    {error && <div className="form-error" role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
  </Modal>;
}

function DetailPanel({ detail, t, close, save, archive }) {
  const c = detail.company;
  useEffect(() => {
    if (detail.focusField)
      document.getElementById("contact-" + detail.focusField)?.focus();
  }, [detail.focusField]);
  const [v, setV] = useState({ ...c }),
    [tab, setTab] = useState(detail.initialTab || "details");
  return (
    <Modal title={c.name} close={close} t={t} wide>
      <div className="detail-tabs">
        {["details", "applications", "source"].map((key) => (
          <button
            className={tab === key ? "active" : ""}
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
      {tab === "details" ? (
        <Form
          t={t}
          close={close}
          save={() =>
            save({
              status: v.status,
              nextAction: v.nextAction,
              notes: v.notes,
              email: v.email,
              website: v.website,
              careersUrl: v.careersUrl,
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
      ) : tab === "applications" ? (
        <>
          <p className="dialog-intro">
            Accounts, career profiles, CVs and confirmed applications are recorded separately.
          </p>
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
        url ? (
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
