import { FormEvent, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api, supabaseConfigured, type AdminAccount, type AdminAccountInspection, type AdminLead, type AdminOrder, type AdminOrderMessage, type AdminProduct, type AdminSecurityEvent, type Catalog, type CatalogProduct, type OrderHistoryItem, type OrderStatus } from "./api";

type Lang = "ar" | "en";
type BotMessage = { id: number; sender: "user" | "bot"; text: string };
type BotTopic = { id: string; label: string; keywords: string[]; answer: string };
const featureIcons = ["↗", "Aa", "✳", "T", "▦", "◫", "✦", "♫", "Ⅲ", "◇", "◌", "▣", "⌖", "⌘", "AI", "＋"];
const botKnowledge: Record<Lang, { title: string; welcome: string; placeholder: string; send: string; whatsapp: string; fallback: string; topics: BotTopic[] }> = {
  en: {
    title: "MF assistant",
    welcome: "Hi! Ask me about MF, its tools, compatibility, plans, installation, or AI features.",
    placeholder: "Type your question…",
    send: "Send",
    whatsapp: "Ask on WhatsApp",
    fallback: "I don't have a prepared answer for that yet. Message us on WhatsApp and the team can help.",
    topics: [
      { id: "about", label: "What is MF?", keywords: ["what is", "about", "plugin", "extension", "premiere"], answer: "MF is an extension panel for Adobe Premiere Pro, not a standalone video editor. It brings editing and creative tools into your Premiere workflow." },
      { id: "tools", label: "What tools are included?", keywords: ["tools", "features", "included", "sections", "16", "transitions", "titles"], answer: "MF presents 16 areas, including transitions, animated text, motion graphics, titles, overlays, effects, sound effects, lower thirds, backgrounds, split screens, project utilities, optional AI tools, and imported asset packs." },
      { id: "compatibility", label: "Compatibility", keywords: ["compatible", "compatibility", "version", "windows", "mac", "premiere pro 2023"], answer: "The extension manifest declares compatibility with Adobe Premiere Pro 2023 and newer. The documented installer is for Windows; macOS support has not been confirmed." },
      { id: "offline", label: "Does it work offline?", keywords: ["offline", "internet", "without internet", "connection"], answer: "The product guide says core editing tools work offline. Optional cloud AI and subscription license checks may need an internet connection." },
      { id: "plans", label: "Plans and pricing", keywords: ["price", "pricing", "plan", "monthly", "lifetime", "subscription", "cost"], answer: "Current plans, prices, and terms are shown in the pricing section." },
      { id: "license", label: "Account and license", keywords: ["account", "login", "log in", "license", "licence", "renew", "activation", "verification"], answer: "According to the plan requirements, Monthly access is intended to require an account and an active-subscription check, while Lifetime is intended to work without an account. The verified release and license delivery are not enabled yet, so these behaviors cannot be confirmed in a live build." },
      { id: "payment", label: "Payment and delivery", keywords: ["pay", "payment", "transfer", "receipt", "buy", "purchase", "delivery", "download"], answer: "Payment is reviewed manually. Sending a receipt image does not confirm payment; a person verifies the transfer. The private installer download is not enabled until a verified release is configured." },
      { id: "install", label: "How do I install MF?", keywords: ["install", "installation", "setup", "installer", "download", "open"], answer: "MF is installed as a Premiere Pro extension on Windows. Close Premiere Pro during installation, run the official installer when it is available, then restart Premiere Pro and open Window → Extensions → MF. The verified download is not currently enabled." },
      { id: "ai", label: "How do the AI tools work?", keywords: ["ai", "artificial intelligence", "upload", "privacy", "cloud"], answer: "AI features are optional. Some may require a separate provider setup and your confirmation before media is uploaded. Do not use cloud features until you have reviewed the provider and upload details." }
    ]
  },
  ar: {
    title: "مساعد MF",
    welcome: "أهلًا! اسألني عن MF أو الأدوات أو التوافق أو الباقات أو التثبيت أو أدوات الذكاء الاصطناعي.",
    placeholder: "اكتب سؤالك…",
    send: "إرسال",
    whatsapp: "اسألنا على واتساب",
    fallback: "ليس لدي إجابة جاهزة عن هذا السؤال حاليًا. راسلنا على واتساب وسيساعدك فريقنا.",
    topics: [
      { id: "about", label: "ما هو MF؟", keywords: ["ما هو", "ايه هو", "عن", "بلاجن", "إضافة", "اضافة", "بريمير", "premiere", "plugin"], answer: "MF لوحة إضافة تعمل داخل Adobe Premiere Pro، وليست برنامج مونتاج مستقلًا. تجمع أدوات المونتاج والإبداع داخل سير عملك في Premiere." },
      { id: "tools", label: "ما الأدوات الموجودة؟", keywords: ["الأدوات", "الادوات", "المميزات", "الأقسام", "الاقسام", "انتقالات", "عناوين", "١٦", "16"], answer: "تضم MF عدد ١٦ قسمًا، منها الانتقالات وتحريك النصوص والموشن جرافيك والعناوين والأوفرليز والتأثيرات والمؤثرات الصوتية واللوار ثيرد والخلفيات والشاشات المقسمة وأدوات المشروع وأدوات AI الاختيارية والحزم المستوردة." },
      { id: "compatibility", label: "ما الإصدارات المتوافقة؟", keywords: ["توافق", "متوافق", "اصدار", "إصدار", "ويندوز", "ماك", "mac", "2023"], answer: "ملف الإضافة يعلن التوافق مع Adobe Premiere Pro إصدار 2023 وما بعده. ملف التثبيت الموثق مخصص لـ Windows؛ ولم يتم تأكيد دعم macOS." },
      { id: "offline", label: "هل يعمل دون إنترنت؟", keywords: ["انترنت", "إنترنت", "بدون نت", "دون نت", "اوفلاين", "أوفلاين", "offline"], answer: "دليل المنتج يذكر أن أدوات المونتاج الأساسية تعمل دون إنترنت. قد تحتاج أدوات AI السحابية الاختيارية والتحقق من اشتراك شهري إلى اتصال بالإنترنت." },
      { id: "plans", label: "ما الباقات والأسعار؟", keywords: ["سعر", "الأسعار", "السعر", "باقة", "اشتراك", "شهري", "مدى الحياة", "تكلفة", "lifetime", "monthly"], answer: "تعرض صفحة الأسعار الباقات والشروط الحالية." },
      { id: "license", label: "هل أحتاج إلى حساب؟", keywords: ["حساب", "تسجيل الدخول", "اسجل", "تسجيل", "ترخيص", "صلاحية", "تفعيل", "تجديد"], answer: "بحسب متطلبات الباقات، الاشتراك الشهري مصمم ليتطلب حسابًا والتحقق من صلاحية الاشتراك، بينما نسخة مدى الحياة مصممة للعمل دون حساب. لكن الإصدار الموثق وتسليم التراخيص غير مفعّلين بعد، لذلك لا يمكن تأكيد هذا السلوك في نسخة متاحة للاستخدام حاليًا." },
      { id: "payment", label: "كيف أدفع وأستلم؟", keywords: ["دفع", "ادفع", "تحويل", "إيصال", "ايصال", "شراء", "استلام", "تنزيل", "تحميل"], answer: "تتم مراجعة الدفع يدويًا؛ رفع صورة الإيصال لا يعني تأكيد الدفع، إذ يتحقق شخص من التحويل. تنزيل المثبّت الخاص غير مفعّل حتى تجهيز إصدار موثّق." },
      { id: "install", label: "كيف أثبّت MF؟", keywords: ["تثبيت", "اثبت", "تثبيت", "setup", "installer", "افتح", "المثبت", "المثبّت"], answer: "تُثبّت MF كإضافة داخل Premiere Pro على Windows. أغلق Premiere Pro أثناء التثبيت، وشغّل المثبّت الرسمي عند توفره، ثم أعد تشغيل Premiere وافتح Window ← Extensions ← MF. رابط الإصدار الموثّق غير مفعّل حاليًا." },
      { id: "ai", label: "هل ترفع أدوات AI ملفاتي؟", keywords: ["ذكاء", "اصطناعي", "ai", "خصوصية", "خصوصيه", "رفع", "ملفاتي", "ملفاتي"], answer: "أدوات الذكاء الاصطناعي اختيارية. قد تحتاج بعضها إلى إعداد مزوّد خدمة وموافقتك قبل رفع الوسائط. راجع تفاصيل المزوّد والرفع قبل استخدام أي ميزة سحابية." }
    ]
  }
};
type CustomerOrder = { id: string };
type ProductFeature = { title: string; description?: string };
type ProductFaq = { question: string; answer: string };
type AdminSection = "overview" | "products" | "leads" | "accounts" | "security" | "support";

function contentItems<T>(content: Record<string, unknown> | null | undefined, key: string): T[] {
  const value = content?.[key];
  return Array.isArray(value) ? value as T[] : [];
}

function textContent(content: Record<string, unknown> | null | undefined, key: string): string {
  const value = content?.[key];
  return typeof value === "string" ? value : "";
}

const copy = {
  en: {
    navFeatures: "Features", navPlans: "Plans", navHelp: "How it works", navInstall: "Installation", heroEyebrow: "MF / PREMIERE PRO EXTENSION",
    heroTitle: "Your creative tools,", heroAccent: "inside Premiere Pro.", heroText: "Move from a rough idea to a finished frame with motion, titles, overlays, sound and practical project tools — right inside your editing workflow.",
    exploreTools: "Explore the toolkit", panelLabel: "MF / CREATIVE TOOLKIT", panelTitle: "Tools for your timeline", panelCaption: "A focused set of tools, right where you edit.", panelStatus: "READY FOR YOUR NEXT CUT",
    cta: "Explore plans", compatibility: "Made for Adobe Premiere Pro 2023–2026+", offline: "Core tools work offline",
    sectionLabel: "THE MF TOOLKIT", sectionTitle: "16 tools. One place.", sectionText: "Explore the real sections inside MF, from transitions and titles to project tools, AI tools and imported packs.",
    items: ["Transitions", "Text animation", "Motion graphics", "Titles", "Social media", "Overlays", "Effects", "Sound effects", "Lower thirds", "Elements", "Backgrounds", "Split screens", "Guides", "Project tools", "AI tools", "Imported packs"],
    itemDescriptions: [
      "Browse transition presets to move between shots, grouped by visual style.",
      "Explore animated text templates for titles, captions, and typography.",
      "Find motion graphics such as callouts, counters, icons, and animated visuals.",
      "Browse title designs, including openers, end cards, and speaker labels.",
      "Explore graphic styles and templates made for creator and social content.",
      "Browse visual overlays such as light leaks, film grain, particles, and smoke.",
      "Find visual-effect presets for adding motion and stylistic treatments to clips.",
      "Browse sound-effect clips to add accents and details to an edit.",
      "Explore lower-third designs for names, speakers, and on-screen labels.",
      "Browse reusable visual elements such as icons, shapes, arrows, and frames.",
      "Find background assets, including gradients and bokeh looks.",
      "Explore split-screen layouts for presenting multiple shots together.",
      "Open framing and safe-area guides for common video formats.",
      "Open practical utilities for caption, editing, motion, audio, and project tasks.",
      "Access optional AI-assisted tools. Some services may need provider setup and your confirmation before media is uploaded.",
      "Browse asset packs imported into your MF library."
    ],
    panelItems: ["Transitions", "Text animation", "Titles", "Sound effects", "Social media", "Project tools"],
    priceKicker: "SIMPLE, CLEAR PRICING", priceTitle: "Choose your access.", monthly: "Monthly", lifetime: "Lifetime", perMonth: "/ month", oneTime: "one time",
    monthlyDesc: "For the editor in motion. One active device for 30 days.", lifetimeDesc: "One purchase. No expiry. One active device per new license.", buy: "Choose plan",
    howTitle: "A human-reviewed purchase.", steps: ["Choose your plan and send a transfer", "Upload the receipt to your private order page", "Our team verifies the payment independently", "Your access appears securely after approval"],
    paymentTitle: "Contact & manual payment", paymentNote: "Contact MF on WhatsApp to receive the confirmed transfer details before sending money.", wallet: "Official WhatsApp contact",
    orderTitle: "Start your order", contact: "Contact method (phone or email)", contactPlaceholder: "How can we reach you?", plan: "Plan", receipt: "Payment receipt (PDF, JPEG, or PNG · max 5 MB)", submit: "Create private order", pendingWarning: "An uploaded receipt does not confirm payment. Your order stays pending until a person verifies the transfer.", whatsappRedirectNotice: "Sign in or create an account to place an order. No receipt or private access key is sent through WhatsApp.", message: "Message our team", send: "Send message",
    orderCreated: "Private order created", accessToken: "Account order history", orderCode: "Order reference", submitReceipt: "Submit receipt", checkOrder: "Check order", claimAccess: "Retrieve approved access once", pending: "Pending manual payment review", paymentNotReceived: "Payment not received yet", approved: "Payment approved", rejected: "Payment rejected", orderStatus: "Order status",
    adminEntry: "•", adminTitle: "Administrator access", username: "Email address", password: "Password", signIn: "Sign in", dashboard: "Review dashboard", signOut: "Sign out", pendingCount: "Pending", approvedCount: "Approved", rejectedCount: "Rejected", monthlyRevenue: "Monthly sales", lifetimeRevenue: "Lifetime sales", activeLicenses: "Active licenses", activeDevices: "Active devices", activeSubs: "Active monthly subscriptions", expiredSubs: "Expired monthly subscriptions", licenseManagement: "License management", revoke: "Revoke license", reviewAction: "Approve verified payment", notReceived: "Payment not received", reject: "Reject", verify: "I independently verified the transfer", noOrders: "No orders yet.", whatsappOff: "Admin actions are verified by the platform.",
    footer: "A focused toolkit for Premiere Pro.", disclosure: "Optional cloud AI services may require separate provider credentials and your confirmation before media upload.",     err: "Something went wrong", catalogUnavailable: "Pricing and payment details are temporarily unavailable.",
    orderUnavailable: "The live catalog or order service is unavailable. No static prices or payment contact are shown.",
    privacyUnavailable: "The approved privacy notice is not configured. Orders are disabled until it is published.",
    installTitle: "Download & installation", installIntro: "MF installs as a Premiere Pro extension using the Windows installer. The actual download link will be enabled after a verified release is configured.",
    requirementsTitle: "What you need", requirements: ["Adobe Premiere Pro 2023 or newer (the extension manifest declares 2023+ compatibility).", "The documented installer is a Windows .exe; macOS support has not been confirmed.", "Keep Premiere Pro closed while installing or updating MF."],
    installSteps: ["After your payment is independently approved, get the official MF-Setup-2.5.1.exe from the private order page when release delivery is enabled.", "Run the installer and follow Next → Install. Administrator access is not required according to the product guide.", "Restart Premiere Pro, then open Window → Extensions → MF.", "In MF Settings, run the installation check and confirm the required components are present."],
    faqTitle: "Frequently asked questions", faqs: [
      ["Is MF a standalone video editor?", "No. MF is an extension panel that runs inside Adobe Premiere Pro."],
      ["Does MF require an internet connection?", "The product guide says core editing tools work offline. This sales site's planned license checks still need to be completed before subscription access is ready."],
      ["When do I receive the installer?", "After a person verifies your transfer. The private download is not enabled until a verified installer release is configured."],
      ["How do you verify payment?", "You submit a receipt in your private order page; an administrator checks the transfer independently. Uploading an image alone never approves payment."]
    ]
  },
  ar: {
    navFeatures: "المميزات", navPlans: "الأسعار", navHelp: "طريقة الشراء", navInstall: "التنزيل والتثبيت", heroEyebrow: "MF / إضافة Premiere Pro",
    heroTitle: "كل أدواتك الإبداعية،", heroAccent: "داخل Premiere Pro.", heroText: "من الفكرة إلى اللقطة الأخيرة: حركة وعناوين وطبقات صوت وأدوات عملية للمشروع، كلها داخل سير عمل المونتاج.",
    exploreTools: "اكتشف مجموعة الأدوات", panelLabel: "MF / مجموعة الأدوات الإبداعية", panelTitle: "أدوات لكل تايم لاين", panelCaption: "أدوات عملية في المكان الذي تعمل فيه.", panelStatus: "جاهز للّقطة التالية",
    cta: "استكشف الباقات", compatibility: "لـ Adobe Premiere Pro إصدار 2023–2026+", offline: "الأدوات الأساسية تعمل دون إنترنت",
    sectionLabel: "مجموعة أدوات MF", sectionTitle: "١٦ قسمًا، في مكان واحد.", sectionText: "تعرّف على الأقسام الموجودة فعلًا داخل MF، من الانتقالات والعناوين إلى أدوات المشروع والذكاء الاصطناعي والحزم المستوردة.",
    items: ["الانتقالات", "تحريك النصوص", "الموشن جرافيك", "العناوين", "السوشيال ميديا", "الأوفرليز", "التأثيرات", "المؤثرات الصوتية", "اللوار ثيرد", "العناصر", "الخلفيات", "الشاشات المقسمة", "الجايدز", "أدوات المشروع", "أدوات الذكاء الاصطناعي", "الحزم المستوردة"],
    itemDescriptions: [
      "تصفّح انتقالات جاهزة بين اللقطات، مرتبة حسب أسلوب التأثير.",
      "اكتشف قوالب النصوص المتحركة للعناوين والكابتشن والتايبوجرافي.",
      "اعثر على عناصر موشن جرافيك مثل النداءات والعدادات والأيقونات.",
      "تصفّح تصميمات العناوين والافتتاحيات والنهايات وأسماء المتحدثين.",
      "اكتشف تصميمات وقوالب مناسبة لمحتوى صناع الفيديو والسوشيال ميديا.",
      "تصفّح طبقات بصرية مثل تسريب الضوء وحبيبات الفيلم والجزيئات والدخان.",
      "اعثر على تأثيرات بصرية لإضافة الحركة واللمسات الإبداعية إلى اللقطات.",
      "تصفّح مؤثرات صوتية لإضافة اللمسات والتأكيدات إلى المونتاج.",
      "اكتشف تصميمات اللوار ثيرد لعرض الأسماء والمتحدثين والبيانات على الشاشة.",
      "تصفّح عناصر جاهزة مثل الأيقونات والأشكال والأسهم والإطارات.",
      "اعثر على خلفيات متنوعة، منها التدرجات وتأثيرات البوكيه.",
      "تصفّح تخطيطات الشاشة المقسمة لعرض أكثر من لقطة معًا.",
      "افتح أدلة الكادر ومناطق الأمان لمقاسات الفيديو الشائعة.",
      "افتح أدوات عملية للكابتشن والمونتاج والحركة والصوت والمشروع.",
      "استخدم أدوات مساعدة بالذكاء الاصطناعي. قد تحتاج بعض الخدمات إلى إعداد مزوّد وموافقتك قبل رفع الوسائط.",
      "تصفّح حزم الأصول التي استوردتها إلى مكتبة MF."
    ],
    panelItems: ["الانتقالات", "تحريك النصوص", "العناوين", "المؤثرات الصوتية", "السوشيال ميديا", "أدوات المشروع"],
    priceKicker: "أسعار واضحة وبسيطة", priceTitle: "اختر طريقة الاستخدام.", monthly: "شهري", lifetime: "مدى الحياة", perMonth: "/ شهريًا", oneTime: "دفعة واحدة",
    monthlyDesc: "للمونتير الذي يعمل باستمرار. لمدة 30 يومًا على جهاز نشط واحد.", lifetimeDesc: "شراء مرة واحدة دون تاريخ انتهاء، لجهاز نشط واحد.", buy: "اختر الباقة",
    howTitle: "مراجعة بشرية للدفع.", steps: ["اختر الباقة وأرسل التحويل", "ارفع الإيصال في صفحة طلبك الخاصة", "نتحقق من التحويل بشكل مستقل", "يظهر وصولك بأمان بعد الموافقة"],
    paymentTitle: "التواصل وإتمام الدفع", paymentNote: "تواصل مع MF عبر واتساب للحصول على بيانات التحويل المؤكدة قبل إرسال المبلغ.", wallet: "واتساب MF الرسمي",
    orderTitle: "ابدأ طلبك", contact: "وسيلة التواصل (هاتف أو بريد)", contactPlaceholder: "كيف يمكننا التواصل معك؟", plan: "الباقة", receipt: "إيصال الدفع (PDF أو JPEG أو PNG · حتى ٥ ميجابايت)", submit: "إنشاء طلب خاص", pendingWarning: "رفع الإيصال لا يؤكد الدفع. يظل طلبك قيد الانتظار حتى يتحقق شخص من التحويل.", whatsappRedirectNotice: "سجّل الدخول أو أنشئ حسابًا لتقديم الطلب. لن يُرسل إيصال أو مفتاح وصول خاص عبر واتساب.", message: "راسل فريقنا", send: "إرسال الرسالة",
    orderCreated: "تم إنشاء الطلب الخاص", accessToken: "سجل الطلبات", orderCode: "رقم الطلب", submitReceipt: "إرسال الإيصال", checkOrder: "حالة الطلب", claimAccess: "استلام الوصول المعتمد مرة واحدة", pending: "بانتظار مراجعة الدفع يدويًا", paymentNotReceived: "لم يصل الدفع بعد", approved: "تمت الموافقة على الدفع", rejected: "تم رفض الدفع", orderStatus: "حالة الطلب",
    adminEntry: "•", adminTitle: "دخول الإدارة", username: "البريد الإلكتروني", password: "كلمة المرور", signIn: "دخول", dashboard: "لوحة مراجعة الطلبات", signOut: "خروج", pendingCount: "قيد المراجعة", approvedCount: "مقبول", rejectedCount: "مرفوض", monthlyRevenue: "مبيعات شهرية", lifetimeRevenue: "مبيعات مدى الحياة", activeLicenses: "تراخيص نشطة", activeDevices: "أجهزة نشطة", activeSubs: "اشتراكات شهرية نشطة", expiredSubs: "اشتراكات شهرية منتهية", licenseManagement: "إدارة التراخيص", revoke: "إلغاء الترخيص", reviewAction: "موافقة بعد التحقق", notReceived: "الدفع لم يصل", reject: "رفض", verify: "تحققت بنفسي من التحويل", noOrders: "لا توجد طلبات بعد.", whatsappOff: "تتحقق المنصة من صلاحية إجراءات الإدارة.",
    footer: "أدوات عملية لـ Premiere Pro.", disclosure: "قد تتطلب خدمات الذكاء الاصطناعي السحابية الاختيارية مفاتيح من مزود الخدمة وموافقتك قبل رفع الوسائط.", err: "حدث خطأ", catalogUnavailable: "الأسعار وبيانات الدفع غير متاحة مؤقتًا.",
    orderUnavailable: "الكتالوج المباشر أو خدمة الطلبات غير متاحين. لن نعرض أسعارًا أو بيانات دفع ثابتة.",
    privacyUnavailable: "إشعار الخصوصية المعتمد غير مُعد. تم إيقاف الطلبات حتى نشره.",
    installTitle: "تنزيل البلاجن وتثبيته", installIntro: "يُثبّت MF كإضافة داخل Premiere Pro باستخدام ملف تثبيت Windows. رابط التنزيل الفعلي سيتاح بعد تجهيز نسخة إصدار موثّقة.",
    requirementsTitle: "المتطلبات", requirements: ["Adobe Premiere Pro إصدار 2023 أو أحدث (ملف الإضافة يعلن التوافق من 2023 فما بعد).", "ملف التثبيت الموثق بصيغة EXE لنظام Windows؛ لم يتم تأكيد دعم macOS.", "أغلق Premiere Pro أثناء تثبيت MF أو تحديثه."],
    installSteps: ["بعد التحقق من التحويل يدويًا، استلم ملف MF-Setup-2.5.1.exe الرسمي من صفحة الطلب الخاصة عند تفعيل تنزيل الإصدار.", "شغّل المثبّت واتبع Next ثم Install. دليل المنتج يذكر أن صلاحيات المسؤول غير مطلوبة.", "أعد تشغيل Premiere Pro، ثم افتح Window ← Extensions ← MF.", "من إعدادات MF شغّل فحص التثبيت وتأكد من وجود المكونات المطلوبة."],
    faqTitle: "أسئلة شائعة", faqs: [
      ["هل MF برنامج مونتاج مستقل؟", "لا. MF لوحة إضافة تعمل من داخل Adobe Premiere Pro."],
      ["هل يحتاج MF إلى إنترنت؟", "دليل المنتج يذكر أن أدوات المونتاج الأساسية تعمل دون إنترنت. أما التحقق من ترخيص الاشتراك المطلوب فما زال يحتاج إلى استكمال قبل تفعيل الاشتراكات."],
      ["متى أستلم ملف التثبيت؟", "بعد مراجعة التحويل والموافقة عليه. التنزيل الخاص لن يتفعّل قبل تجهيز إصدار موثّق."],
      ["كيف يتم تأكيد الدفع؟", "ترفع الإيصال في صفحة طلبك الخاصة، ثم يراجع المسؤول التحويل بشكل مستقل. رفع الصورة وحده لا يعني قبول الدفع."]
    ]
  }
};

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<"home"|"order"|"status"|"admin">(() => window.location.pathname.replace(/\/+$/, "") === "/admin" ? "admin" : "home");
  const [productSlug, setProductSlug] = useState("mf-plugin");
  const [plan, setPlan] = useState("");
  const [contact, setContact] = useState("");
  const [fullName, setFullName] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [authMode, setAuthMode] = useState<"signin"|"signup"|"recovery"|"set-password">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderHistoryItem[]>([]);
  const [status, setStatus] = useState("");
  const [orderData, setOrderData] = useState<OrderStatus | null>(null);
  const [messageText, setMessageText] = useState("");
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [checkoutSessionId, setCheckoutSessionId] = useState("");
  const [checkoutLeadId, setCheckoutLeadId] = useState("");
  const whatsappClicked = useRef(false);
  const [adminOverview, setAdminOverview] = useState<Record<string, unknown> | null>(null);
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [supportOrderId, setSupportOrderId] = useState("");
  const [supportMessages, setSupportMessages] = useState<AdminOrderMessage[]>([]);
  const [adminReply, setAdminReply] = useState("");
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const [adminProducts, setAdminProducts] = useState<AdminProduct[]>([]);
  const [adminLeads, setAdminLeads] = useState<AdminLead[]>([]);
  const [leadStatusFilter, setLeadStatusFilter] = useState("");
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountInspection, setAccountInspection] = useState<AdminAccountInspection | null>(null);
  const [accountStatusReason, setAccountStatusReason] = useState("");
  const [securityEvents, setSecurityEvents] = useState<AdminSecurityEvent[]>([]);
  const [productFormId, setProductFormId] = useState("");
  const [productForm, setProductForm] = useState({ slug: "", name: "", description: "", websiteUrl: "", supportWhatsapp: "", status: "draft" as "active" | "draft" | "archived", contentJson: "{}" });
  const [planFormId, setPlanFormId] = useState("");
  const [planForm, setPlanForm] = useState({ productId: "", code: "", displayName: "", price: "", billingType: "monthly" as "monthly" | "lifetime", durationDays: "30", deviceLimit: "1", isActive: true });
  const [grantForm, setGrantForm] = useState({ productId: "", planId: "", paymentReference: "", reason: "" });
  const [entitlementReason, setEntitlementReason] = useState("");
  const [leadLoading, setLeadLoading] = useState(false);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [paymentReferences, setPaymentReferences] = useState<Record<string, string>>({});
  const [botOpen, setBotOpen] = useState(false);
  const [botInput, setBotInput] = useState("");
  const [botMessages, setBotMessages] = useState<BotMessage[]>([]);
  const t = copy[lang];
  const bot = botKnowledge[lang];
  const toggleLang = () => setLang(lang === "ar" ? "en" : "ar");
  const setErrorSafe = (e: unknown) => setError(e instanceof Error ? e.message : t.err);
  const authRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim() || window.location.origin;
  const product: CatalogProduct | undefined = catalog?.products.find((item) => item.slug === productSlug) ?? catalog?.products.find((item) => item.slug === "mf-plugin") ?? catalog?.products[0];
  const offers = product?.plans ?? [];
  const selectedOffer = offers.find((item) => item.code === plan) ?? offers[0];
  const isAdmin = authUser?.app_metadata?.role === "admin";
  const whatsappNumber = product?.supportWhatsapp?.replace(/\D/g, "") ?? "";
  const configuredProductEmail = typeof product?.content?.supportEmail === "string" ? product.content.supportEmail.trim() : "";
  const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredProductEmail)
    ? configuredProductEmail
    : import.meta.env.VITE_SUPPORT_EMAIL?.trim() || "mf.plaugin@gmail.com";
  const productFeatures: (ProductFeature | string)[] = contentItems<unknown>(product?.content, "features").flatMap<ProductFeature | string>((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && "title" in item && typeof item.title === "string") {
      return [{ title: item.title, description: "description" in item && typeof item.description === "string" ? item.description : undefined }];
    }
    return [];
  });
  const productFaqs: ProductFaq[] = contentItems<unknown>(product?.content, "faqs").flatMap((item) =>
    item && typeof item === "object" && "question" in item && typeof item.question === "string" && "answer" in item && typeof item.answer === "string"
      ? [{ question: item.question, answer: item.answer }]
      : []);
  const rawPlanDescriptions = product?.content?.planDescriptions;
  const planDescriptions = rawPlanDescriptions && typeof rawPlanDescriptions === "object" && !Array.isArray(rawPlanDescriptions)
    ? Object.fromEntries(Object.entries(rawPlanDescriptions).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const rawPrivacyNotice = product?.content?.privacyNotice;
  const privacyNotice = typeof rawPrivacyNotice === "string"
    ? rawPrivacyNotice
    : rawPrivacyNotice && typeof rawPrivacyNotice === "object" && !Array.isArray(rawPrivacyNotice)
      ? (rawPrivacyNotice as Record<string, unknown>)[lang] ?? (rawPrivacyNotice as Record<string, unknown>).en
      : null;
  const privacyNoticeText = typeof privacyNotice === "string" ? privacyNotice.trim() : "";
  const privacyNoticeVersion = typeof product?.content?.privacyNoticeVersion === "string"
    ? product.content.privacyNoticeVersion.trim()
    : "";
  useEffect(() => {
    api.catalog().then((liveCatalog) => {
      setCatalog(liveCatalog);
      const defaultProduct = liveCatalog.products.find((item) => item.slug === "mf-plugin") ?? liveCatalog.products[0];
      setProductSlug(defaultProduct?.slug ?? "");
      setPlan(defaultProduct?.plans[0]?.code ?? "");
    }).catch(() => setCatalog(null)).finally(() => setCatalogLoading(false));
  }, []);
  useEffect(() => {
    if (!supabaseConfigured) return;
    const subscription = api.onAuthStateChange((user, event) => {
      setAuthUser(user);
      setError("");
      setAuthNotice("");
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("set-password");
        setView("order");
      }
    }).data.subscription;
    api.currentUser().then(setAuthUser).catch(() => setAuthUser(null));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const syncRoute = () => setView(window.location.pathname.replace(/\/+$/, "") === "/admin" ? "admin" : "home");
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);
  useEffect(() => {
    const path = view === "admin" ? "/admin" : "/";
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  }, [view]);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; }, [lang]);
  useEffect(() => {
    if (!authUser) {
      setOrderHistory([]);
      setOrder(null);
      setOrderData(null);
      return;
    }
    api.orderHistory().then(({ orders }) => {
      setOrderHistory(orders);
      const savedId = sessionStorage.getItem("mf-order-id");
      const selected = orders.find((item) => item.id === savedId) ?? orders[0];
      setOrder(selected ? { id: selected.id } : null);
      if (selected) sessionStorage.setItem("mf-order-id", selected.id);
      else sessionStorage.removeItem("mf-order-id");
    }).catch(setErrorSafe);
  }, [authUser]);
  useEffect(() => {
    if (view === "status" && order) {
      api.orderStatus(order.id).then((data) => { setStatus(data.status); setOrderData(data); }).catch(setErrorSafe);
    }
  }, [view, order?.id]);
  useEffect(() => {
    if (view !== "admin" || !isAdmin) return;
    Promise.all([api.adminOverview(), api.adminOrders("pending")])
      .then(([overview, result]) => { setAdminOverview(overview); setAdminOrders(result.orders); })
      .catch(setErrorSafe);
  }, [view, isAdmin]);
  useEffect(() => {
    if (!checkoutSessionId || order || whatsappClicked.current) return;
    const onPageHide = () => { void api.abandonCheckout(checkoutSessionId, true).catch(() => undefined); };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [checkoutSessionId, order?.id]);

  async function startCheckout(selectedPlan: string) {
    setError("");
    if (!product || !selectedPlan) { setError(t.orderUnavailable); return; }
    try {
      if (checkoutSessionId && !order) await api.abandonCheckout(checkoutSessionId).catch(() => undefined);
      const result = await api.createCheckoutSession({ productSlug: product.slug, planCode: selectedPlan });
      setPlan(selectedPlan);
      setCheckoutSessionId(result.session.id);
      setCheckoutLeadId("");
      whatsappClicked.current = false;
      setView("order");
    } catch (e) { setErrorSafe(e); }
  }

  async function openWhatsApp() {
    if (!product || !whatsappNumber || !selectedOffer?.code) { setError(t.orderUnavailable); return; }
    try {
      let sessionId = checkoutSessionId;
      if (!sessionId) {
        const result = await api.createCheckoutSession({ productSlug: product.slug, planCode: selectedOffer?.code ?? plan });
        sessionId = result.session.id;
        setCheckoutSessionId(sessionId);
      }
      await api.trackWhatsAppClick(sessionId);
      whatsappClicked.current = true;
      const term = selectedOffer.billingType === "lifetime"
        ? (lang === "ar" ? "دون انتهاء" : "no expiry")
        : `${selectedOffer.durationDays ?? "—"} ${lang === "ar" ? "يومًا" : "days"}`;
      const text = lang === "ar"
        ? `مرحبًا، أريد الاستفسار عن ${product.name} — ${selectedOffer.displayName}، ${selectedOffer.price} ${selectedOffer.currency}، ${term}.`
        : `Hello, I am interested in ${product.name} — ${selectedOffer.displayName}, ${selectedOffer.price} ${selectedOffer.currency}, ${term}.`;
      window.location.assign(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`);
    } catch (e) { setErrorSafe(e); }
  }
  function answerForTopic(topic?: BotTopic) {
    if (topic?.id === "about") return product?.description || t.orderUnavailable;
    if (topic?.id === "tools") {
      if (!productFeatures.length) return t.orderUnavailable;
      return productFeatures.map((feature) => typeof feature === "string" ? feature : feature.title).filter(Boolean).join(" · ");
    }
    if (topic?.id === "plans") {
      if (!offers.length) return t.orderUnavailable;
      return offers.map((offer) => {
        const term = offer.billingType === "lifetime" ? (lang === "ar" ? "بلا انتهاء" : "no expiry") : `${offer.durationDays ?? "—"} ${lang === "ar" ? "يومًا" : "days"}`;
        return `${offer.displayName}: ${offer.price} ${offer.currency}, ${term}, ${offer.deviceLimit} ${lang === "ar" ? "جهاز" : "device(s)"}`;
      }).join("\n");
    }
    return topic?.answer ?? bot.fallback;
  }
  function answerBot(question: string, topic: BotTopic) {
    const nextId = Date.now();
    setBotMessages((messages) => [...messages,
      { id: nextId, sender: "user", text: question },
      { id: nextId + 1, sender: "bot", text: answerForTopic(topic) }
    ]);
  }
  function askBot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = botInput.trim();
    if (!question) return;
    const normalized = question.toLocaleLowerCase().replace(/[أإآ]/g, "ا").replace(/[ًٌٍَُِّْـ]/g, "");
    const topic = bot.topics.find((candidate) => candidate.keywords.some((keyword) =>
      normalized.includes(keyword.toLocaleLowerCase().replace(/[أإآ]/g, "ا"))
    ));
    const nextId = Date.now();
    setBotMessages((messages) => [...messages,
      { id: nextId, sender: "user", text: question },
      { id: nextId + 1, sender: "bot", text: answerForTopic(topic) }
    ]);
    setBotInput("");
  }
  async function createOrder(e: FormEvent) {
    e.preventDefault(); setError("");
    if (!product || !plan) { setError(t.orderUnavailable); return; }
    if (!authUser) { setError(lang === "ar" ? "سجّل الدخول أو أنشئ حسابًا أولًا." : "Sign in or create an account before placing an order."); return; }
    if (!privacyAccepted) { setError(lang === "ar" ? "يرجى الموافقة على إشعار الخصوصية للمتابعة." : "Please acknowledge the privacy notice to continue."); return; }
    if (!privacyNoticeText || !privacyNoticeVersion || privacyNoticeVersion.length > 40) { setError(t.privacyUnavailable); return; }
    const contactValue = contact.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue);
    const isPhone = /^\+?[0-9 ()-]{7,32}$/.test(contactValue);
    if (!isEmail && !isPhone) { setError(lang === "ar" ? "أدخل بريدًا إلكترونيًا أو رقم هاتف صحيحًا." : "Enter a valid email address or phone number."); return; }
    try {
      let leadId = checkoutLeadId;
      if (!leadId) {
        const lead = await api.createLead({
          productSlug: product.slug,
          ...(isEmail ? { email: contactValue } : { phone: contactValue }),
          fullName: fullName.trim(),
          locale: lang,
          marketingConsent,
          privacyAccepted: true,
          privacyNoticeVersion,
        });
        leadId = lead.lead.id;
        setCheckoutLeadId(leadId);
      }
      const previousSessionId = checkoutSessionId;
      const session = await api.createCheckoutSession({ productSlug: product.slug, planCode: plan, leadId });
      const sessionId = session.session.id;
      if (previousSessionId && previousSessionId !== sessionId) await api.abandonCheckout(previousSessionId).catch(() => undefined);
      setCheckoutSessionId(sessionId);
      const created = await api.createOrder(product.slug, plan, sessionId);
      const newOrder: CustomerOrder = { id: created.orderId };
      setOrder(newOrder);
      sessionStorage.setItem("mf-order-id", created.orderId);
      setOrderHistory((previous) => [{
        id: created.orderId, plan, status: created.status, createdAt: new Date().toISOString(),
        reviewedAt: null, reviewNote: null, productId: product.id, planId: selectedOffer?.id ?? "",
        price: selectedOffer?.price ?? 0, currency: selectedOffer?.currency ?? "", receiptSubmitted: false,
      }, ...previous]);
      setView("status");
      setCheckoutSessionId("");
      setError("");
    } catch (e) { setErrorSafe(e); }
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!order) return;
    const file = (new FormData(e.currentTarget).get("receipt")) as File;
    if (!file?.size) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError(lang === "ar" ? "اختر ملف PDF أو JPEG أو PNG بحجم لا يتجاوز 5 ميجابايت." : "Choose a PDF, JPEG, or PNG file no larger than 5 MB.");
      return;
    }
    try {
      await api.uploadReceipt(order.id, file);
      const fresh = await api.orderStatus(order.id);
      setOrderData(fresh);
      setStatus(fresh.status);
      setOrderHistory((previous) => previous.map((item) => item.id === order.id ? { ...item, receiptSubmitted: true, status: fresh.status } : item));
      setError("");
      e.currentTarget.reset();
    }
    catch (e) { setErrorSafe(e); }
  }
  async function authenticate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setAuthNotice("");
    try {
      if (authMode === "signup") {
        if (!product || !privacyAccepted || !privacyNoticeText || !privacyNoticeVersion || privacyNoticeVersion.length > 40) {
          throw new Error(t.privacyUnavailable);
        }
        const lead = await api.createLead({
          productSlug: product.slug,
          email: authEmail.trim(),
          fullName: fullName.trim(),
          locale: lang,
          marketingConsent,
          privacyAccepted: true,
          privacyNoticeVersion,
        });
        setCheckoutLeadId(lead.lead.id);
        const { data, error: authError } = await api.signUp(authEmail.trim(), authPassword, fullName.trim(), authRedirectUrl);
        if (authError) throw authError;
        if (!data.session) {
          setAuthNotice(lang === "ar" ? "تحقق من بريدك الإلكتروني لتأكيد الحساب، ثم سجّل الدخول." : "Check your email to confirm your account, then sign in.");
        }
        if (data.user) setAuthUser(data.user);
      } else {
        const { data, error: authError } = await api.signIn(authEmail.trim(), authPassword);
        if (authError) throw authError;
        setAuthUser(data.user);
      }
      setAuthPassword("");
    }
    catch (e) { setErrorSafe(e); }
  }
  async function requestPasswordReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { error: authError } = await api.resetPassword(authEmail.trim(), authRedirectUrl);
      if (authError) throw authError;
      setAuthNotice(lang === "ar" ? "إذا كان الحساب موجودًا، فستصلك رسالة لإعادة تعيين كلمة المرور." : "If the account exists, a password reset email will be sent.");
    } catch (e) { setErrorSafe(e); }
  }
  async function updatePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { error: authError } = await api.updatePassword(newPassword);
      if (authError) throw authError;
      setNewPassword("");
      setAuthMode("signin");
      setAuthNotice(lang === "ar" ? "تم تحديث كلمة المرور. يمكنك متابعة طلبك." : "Password updated. You can continue with your order.");
    } catch (e) { setErrorSafe(e); }
  }
  async function adminLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { data, error: authError } = await api.signIn(authEmail.trim(), authPassword);
      if (authError) throw authError;
      setAuthUser(data.user);
      setAuthPassword("");
      if (data.user.app_metadata?.role !== "admin") setError(lang === "ar" ? "هذا الحساب غير مصرح له بإدارة المنصة." : "This account does not have the admin role.");
    } catch (e) { setErrorSafe(e); }
  }
  async function customerLogin(e: FormEvent) {
    e.preventDefault();
    try {
      const { data, error: authError } = await api.signIn(authEmail.trim(), authPassword);
      if (authError) throw authError;
      setAuthUser(data.user);
      setAuthPassword("");
      setError("");
    } catch (e) { setErrorSafe(e); }
  }
  async function signOut() {
    try {
      const { error: authError } = await api.signOut();
      if (authError) throw authError;
      setAuthUser(null);
      setAdminOverview(null);
      setAdminOrders([]);
    } catch (e) { setErrorSafe(e); }
  }
  async function refreshAdmin() {
    try {
      const [overview, result] = await Promise.all([api.adminOverview(), api.adminOrders("pending")]);
      setAdminOverview(overview);
      setAdminOrders(result.orders);
    } catch (e) { setErrorSafe(e); }
  }
  async function loadAdminSection(section: AdminSection) {
    setAdminSection(section);
    setError("");
    try {
      if (section === "overview") await refreshAdmin();
      if (section === "products") {
        const result = await api.adminProducts();
        setAdminProducts(result.products);
        if (!grantForm.productId && result.products[0]) setGrantForm((form) => ({ ...form, productId: result.products[0].id }));
      }
      if (section === "leads") {
        setLeadLoading(true);
        const result = await api.adminLeads(leadStatusFilter);
        setAdminLeads(result.leads);
      }
      if (section === "accounts") {
        const [result, productsResult] = await Promise.all([
          api.adminAccounts(accountQuery),
          adminProducts.length ? Promise.resolve({ products: adminProducts }) : api.adminProducts(),
        ]);
        setAdminAccounts(result.accounts);
        setAdminProducts(productsResult.products);
        if (!grantForm.productId && productsResult.products[0]) setGrantForm((form) => ({ ...form, productId: productsResult.products[0].id }));
      }
      if (section === "security") {
        const result = await api.adminSecurityEvents(accountInspection ? { accountId: accountInspection.account.id } : {});
        setSecurityEvents(result.events);
      }
      if (section === "support") {
        const result = await api.adminOrders("");
        setAdminOrders(result.orders);
        if (supportOrderId && !result.orders.some((item) => item.id === supportOrderId)) {
          setSupportOrderId("");
          setSupportMessages([]);
        }
      }
    } catch (e) { setErrorSafe(e); }
    finally { setLeadLoading(false); }
  }
  async function searchAccounts(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api.adminAccounts(accountQuery.trim());
      setAdminAccounts(result.accounts);
      setAccountInspection(null);
    } catch (e) { setErrorSafe(e); }
  }
  async function loadSupportMessages(orderId: string) {
    setSupportOrderId(orderId);
    setSupportMessages([]);
    if (!orderId) return;
    try {
      const result = await api.adminOrderMessages(orderId);
      setSupportMessages(result.messages);
    } catch (e) { setErrorSafe(e); }
  }
  async function sendAdminReply(event: FormEvent) {
    event.preventDefault();
    if (!supportOrderId || !adminReply.trim()) return;
    try {
      await api.sendAdminOrderMessage(supportOrderId, adminReply.trim());
      setAdminReply("");
      await loadSupportMessages(supportOrderId);
    } catch (e) { setErrorSafe(e); }
  }
  async function inspectAccount(account: AdminAccount) {
    try {
      const inspection = await api.inspectAccount(account.id);
      setAccountInspection(inspection);
      setAccountStatusReason("");
    } catch (e) { setErrorSafe(e); }
  }
  async function refreshInspection() {
    if (!accountInspection) return;
    try {
      const inspection = await api.inspectAccount(accountInspection.account.id);
      setAccountInspection(inspection);
    } catch (e) { setErrorSafe(e); }
  }
  async function updateLeadStatus(leadId: string, nextStatus: Exclude<AdminLead["status"], "converted">) {
    try {
      await api.updateLead(leadId, nextStatus);
      setAdminLeads((leads) => leads.map((lead) => lead.id === leadId ? { ...lead, status: nextStatus } : lead));
    } catch (e) { setErrorSafe(e); }
  }
  function editProduct(product: AdminProduct) {
    setProductFormId(product.id);
    setProductForm({
      slug: product.slug,
      name: product.name,
      description: product.description,
      websiteUrl: product.websiteUrl ?? "",
      supportWhatsapp: product.supportWhatsapp ?? "",
      status: product.status,
      contentJson: JSON.stringify(product.content ?? {}, null, 2),
    });
  }
  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    try {
      const content = JSON.parse(productForm.contentJson);
      if (!content || Array.isArray(content) || typeof content !== "object") throw new Error("Content must be a JSON object.");
      await api.saveProduct({
        productId: productFormId || undefined,
        slug: productForm.slug,
        name: productForm.name,
        description: productForm.description,
        websiteUrl: productForm.websiteUrl,
        supportWhatsapp: productForm.supportWhatsapp,
        status: productForm.status,
        content,
      });
      setProductFormId("");
      const result = await api.adminProducts();
      setAdminProducts(result.products);
      const liveCatalog = await api.catalog();
      setCatalog(liveCatalog);
      setError("");
    } catch (e) { setErrorSafe(e); }
  }
  function editPlan(product: AdminProduct, planItem: AdminProduct["plans"][number]) {
    setPlanFormId(planItem.id);
    setPlanForm({
      productId: product.id,
      code: planItem.code,
      displayName: planItem.displayName,
      price: String(planItem.amountMinor / 100),
      billingType: planItem.billingType === "lifetime" ? "lifetime" : "monthly",
      durationDays: String(planItem.durationDays ?? 30),
      deviceLimit: String(planItem.deviceLimit),
      isActive: planItem.isActive,
    });
  }
  async function savePlan(event: FormEvent) {
    event.preventDefault();
    try {
      await api.savePlan({
        planId: planFormId || undefined,
        productId: planForm.productId,
        code: planForm.code,
        displayName: planForm.displayName,
        price: Number(planForm.price),
        billingType: planForm.billingType,
        durationDays: planForm.billingType === "monthly" ? Number(planForm.durationDays) : null,
        deviceLimit: Number(planForm.deviceLimit),
        isActive: planForm.isActive,
      });
      setPlanFormId("");
      const result = await api.adminProducts();
      setAdminProducts(result.products);
      setCatalog(await api.catalog());
      setError("");
    } catch (e) { setErrorSafe(e); }
  }
  async function grantEntitlement(event: FormEvent) {
    event.preventDefault();
    if (!accountInspection) return;
    const selectedProduct = adminProducts.find((item) => item.id === grantForm.productId);
    const selectedPlan = selectedProduct?.plans.find((item) => item.id === grantForm.planId);
    if (!selectedProduct || !selectedPlan || !grantForm.reason.trim() ||
        (selectedPlan.billingType === "monthly" && !grantForm.paymentReference.trim())) {
      setError(lang === "ar" ? "اختر منتجًا وباقة وأدخل سبب المنح ومرجع الدفع الذي تم التحقق منه للاشتراك الشهري." : "Select a product and plan, provide a grant reason, and enter the verified payment reference for a Monthly plan.");
      return;
    }
    try {
      await api.grantEntitlement({
        targetUserId: accountInspection.account.id,
        productId: selectedProduct.id,
        planId: selectedPlan.id,
        plan: selectedPlan.billingType === "lifetime" ? "lifetime" : "monthly",
        paymentReference: grantForm.paymentReference.trim(),
        reason: grantForm.reason.trim(),
      });
      setGrantForm((form) => ({ ...form, paymentReference: "", reason: "" }));
      await refreshInspection();
      setError("");
    } catch (e) { setErrorSafe(e); }
  }
  async function revokeEntitlement(entitlementId: string) {
    const reason = entitlementReason.trim();
    if (!accountInspection || !reason) {
      setError(lang === "ar" ? "أدخل سبب إلغاء الاستحقاق." : "Enter a reason before revoking the entitlement.");
      return;
    }
    try {
      await api.revokeEntitlement(accountInspection.account.id, entitlementId, reason);
      setEntitlementReason("");
      await refreshInspection();
    } catch (e) { setErrorSafe(e); }
  }
  async function revokeDevice(deviceHash: string, productId: string) {
    if (!accountInspection || !window.confirm(lang === "ar" ? "هل تريد إلغاء تسجيل هذا الجهاز؟" : "Revoke this device registration?")) return;
    try {
      await api.revokeDevice(accountInspection.account.id, productId, deviceHash);
      await refreshInspection();
    } catch (e) { setErrorSafe(e); }
  }
  async function setAccountSuspended(suspended: boolean) {
    const reason = accountStatusReason.trim();
    if (!accountInspection || !reason || reason.length > 500) {
      setError(lang === "ar" ? "أدخل سببًا إداريًا من 1 إلى 500 حرف." : "Enter an administrator reason of 1–500 characters.");
      return;
    }
    if (!accountInspection || !window.confirm(suspended
      ? (lang === "ar" ? "تعليق هذا الحساب؟" : "Suspend this account?")
      : (lang === "ar" ? "إعادة تفعيل هذا الحساب؟" : "Reactivate this account?"))) return;
    try {
      await api.setAccountSuspended(accountInspection.account.id, suspended, reason);
      setAccountStatusReason("");
      await refreshInspection();
    } catch (e) { setErrorSafe(e); }
  }
  async function reviewOrder(orderId: string, decision: "approve" | "reject") {
    const reason = reviewReasons[orderId]?.trim() ?? "";
    const paymentReference = paymentReferences[orderId]?.trim() ?? "";
    if (!reason || (decision === "approve" && !paymentReference)) {
      setError(lang === "ar" ? "أدخل سبب المراجعة ومرجع الدفع الذي تم التحقق منه للموافقة." : "Enter a review reason; approval also requires the independently verified payment reference.");
      return;
    }
    try {
      await api.reviewOrder(orderId, decision, reason, paymentReference);
      setReviewReasons((previous) => ({ ...previous, [orderId]: "" }));
      setPaymentReferences((previous) => ({ ...previous, [orderId]: "" }));
      await refreshAdmin();
    }
    catch (e) { setErrorSafe(e); }
  }
  async function sendCustomerMessage(e: FormEvent) {
    e.preventDefault(); if (!order || !messageText.trim()) return;
    try { await api.customerMessage(order.id, messageText); setMessageText(""); setOrderData(await api.orderStatus(order.id)); }
    catch (e) { setErrorSafe(e); }
  }
  if (view === "admin") return <main className="admin-page" dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="admin-top"><button className="text-button" onClick={toggleLang}>{lang === "ar" ? "EN" : "عربي"}</button><span className="brand-mini">MF / ADMIN</span></div>
    {!isAdmin ? <form className="admin-login panel" onSubmit={adminLogin}><span className="eyebrow">PRIVATE WORKSPACE</span><h1>{t.adminTitle}</h1>
      <label>{t.username}<input type="email" autoComplete="username" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required /></label>
      <label>{t.password}<input type="password" autoComplete="current-password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required /></label>
      <button className="button primary">{t.signIn}</button>{authUser&&<p className="notice">{lang==="ar"?"هذا الحساب غير مصرح له بإدارة المنصة.":"This signed-in account does not have the admin role."}</p>}
      <button type="button" className="text-button" onClick={()=>setView("home")}>← {t.navFeatures}</button></form> :
      <section className="dashboard"><div className="dash-heading"><div><span className="eyebrow">MF / PRIVATE</span><h1>{t.dashboard}</h1></div><div><button className="button ghost" onClick={()=>void refreshAdmin()}>{lang==="ar"?"تحديث":"Refresh"}</button> <button className="button ghost" onClick={()=>void signOut()}>{t.signOut}</button></div></div>
      <p className="notice">{t.whatsappOff}</p>
      <nav className="admin-tabs" aria-label={lang==="ar"?"أقسام الإدارة":"Admin modules"}>
        {([["overview","Overview"],["products","Products"],["leads","Leads"],["accounts","Accounts"],["support","Customer support"],["security","Security events"]] as [AdminSection,string][]).map(([section,label])=><button type="button" className={`button ${adminSection===section?"primary":"ghost"} small`} key={section} onClick={()=>void loadAdminSection(section)}>{lang==="ar"?({overview:"نظرة عامة",products:"المنتجات",leads:"العملاء المحتملون",accounts:"الحسابات",support:"دعم العملاء",security:"أحداث الأمان"} as Record<AdminSection,string>)[section]:label}</button>)}
      </nav>
      {adminSection==="overview"&&<>{adminOverview&&<><h2>{lang==="ar"?"نظرة عامة":"Overview"}</h2><div className="metric-grid">{Object.entries(adminOverview).filter(([,value])=>typeof value==="string"||typeof value==="number"||typeof value==="boolean").map(([label,value])=><article className="metric" key={label}><span>{label}</span><strong>{String(value)}</strong></article>)}</div></>}
      <h2>{lang==="ar"?"الطلبات المعلقة":"Pending orders"}</h2>
      <div className="orders-list">{adminOrders.length===0?<p>{t.noOrders}</p>:adminOrders.map((item)=><article className="order-row" key={item.id}>
        <div><span className={`status-pill ${item.status}`}>{item.status}</span><h3>{item.plan} · {(item.amountMinor/100).toLocaleString()} {item.currency}</h3><p>{item.email}</p><small>{item.id}</small></div>
        <div className="order-actions">{item.receiptUrl&&<a className="text-button" href={item.receiptUrl} target="_blank" rel="noopener noreferrer">{lang==="ar"?"عرض الإيصال":"View receipt"}</a>}</div>
        <label>{lang==="ar"?"سبب المراجعة":"Review reason"}<input value={reviewReasons[item.id]??""} maxLength={500} onChange={e=>setReviewReasons((previous)=>({...previous,[item.id]:e.target.value}))}/></label>
        <label>{lang==="ar"?"مرجع الدفع الذي تم التحقق منه (للموافقة)":"Independently verified payment reference (approval)"}<input value={paymentReferences[item.id]??""} maxLength={200} onChange={e=>setPaymentReferences((previous)=>({...previous,[item.id]:e.target.value}))}/></label>
        <div className="order-actions"><button className="button primary small" onClick={()=>void reviewOrder(item.id,"approve")}>{t.reviewAction}</button><button className="button ghost small" onClick={()=>void reviewOrder(item.id,"reject")}>{t.reject}</button></div>
      </article>)}</div></>}
      {adminSection==="products"&&<section className="admin-module"><h2>{lang==="ar"?"إدارة المنتجات والباقات":"Products and plans"}</h2><p className="notice">{lang==="ar"?"التغييرات تُحفظ عبر نقطة الإدارة المعتمدة؛ لا يتم تعديل قاعدة البيانات من المتصفح مباشرة.":"Changes are submitted to the server-authorized admin endpoint; the browser never writes directly to the database."}</p>
        <div className="orders-list">{adminProducts.map((item)=><article className="order-row" key={item.id}><div><span className={`status-pill ${item.status}`}>{item.status}</span><h3>{item.name}</h3><p>{item.slug} · {item.supportWhatsapp||"—"}</p><p>{item.description}</p></div><button type="button" className="button ghost small" onClick={()=>editProduct(item)}>{lang==="ar"?"تعديل المنتج":"Edit product"}</button><div className="plans-list">{item.plans.map((planItem)=><div className="plan-row" key={planItem.id}><span>{planItem.displayName} · {(planItem.amountMinor/100).toLocaleString()} {planItem.currency} · {planItem.billingType} · {planItem.deviceLimit} device(s) · {planItem.isActive?"active":"inactive"}</span><button type="button" className="text-button" onClick={()=>editPlan(item,planItem)}>{lang==="ar"?"تعديل الباقة":"Edit plan"}</button></div>)}</div></article>)}</div>
        <form className="admin-form" onSubmit={saveProduct}><h3>{productFormId?(lang==="ar"?"تعديل المنتج":"Edit product"):(lang==="ar"?"إضافة منتج":"Add product")}</h3>
          <label>Slug<input value={productForm.slug} onChange={e=>setProductForm({...productForm,slug:e.target.value})} required maxLength={120}/></label>
          <label>{lang==="ar"?"الاسم":"Name"}<input value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})} required maxLength={120}/></label>
          <label>{lang==="ar"?"الوصف":"Description"}<textarea value={productForm.description} onChange={e=>setProductForm({...productForm,description:e.target.value})} maxLength={4000}/></label>
          <label>HTTPS website URL<input type="url" value={productForm.websiteUrl} onChange={e=>setProductForm({...productForm,websiteUrl:e.target.value})}/></label>
          <label>{lang==="ar"?"واتساب الدعم (بصيغة دولية)":"Support WhatsApp (international number)"}<input value={productForm.supportWhatsapp} onChange={e=>setProductForm({...productForm,supportWhatsapp:e.target.value})}/></label>
          <label>Status<select value={productForm.status} onChange={e=>setProductForm({...productForm,status:e.target.value as typeof productForm.status})}><option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option></select></label>
          <label>Structured content JSON (plain text; no HTML)<textarea rows={8} value={productForm.contentJson} onChange={e=>setProductForm({...productForm,contentJson:e.target.value})}/></label>
          <div className="order-actions"><button className="button primary">{lang==="ar"?"حفظ المنتج":"Save product"}</button>{productFormId&&<button type="button" className="button ghost" onClick={()=>setProductFormId("")}>{lang==="ar"?"إلغاء":"Cancel"}</button>}</div>
        </form>
        <form className="admin-form" onSubmit={savePlan}><h3>{planFormId?(lang==="ar"?"تعديل الباقة":"Edit plan"):(lang==="ar"?"إضافة / تحديث باقة":"Add or update plan")}</h3>
          <label>Product<select value={planForm.productId} onChange={e=>setPlanForm({...planForm,productId:e.target.value})} required><option value="">Select product</option>{adminProducts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Plan code<input value={planForm.code} onChange={e=>setPlanForm({...planForm,code:e.target.value})} required maxLength={40}/></label>
          <label>{lang==="ar"?"اسم الباقة":"Display name"}<input value={planForm.displayName} onChange={e=>setPlanForm({...planForm,displayName:e.target.value})} required maxLength={120}/></label>
          <label>Price (EGP)<input type="number" min="0" step="0.01" value={planForm.price} onChange={e=>setPlanForm({...planForm,price:e.target.value})} required/></label>
          <label>Billing type<select value={planForm.billingType} onChange={e=>setPlanForm({...planForm,billingType:e.target.value as typeof planForm.billingType})}><option value="monthly">monthly</option><option value="lifetime">lifetime</option></select></label>
          {planForm.billingType==="monthly"&&<label>Duration (days)<input type="number" min="1" max="366" value={planForm.durationDays} onChange={e=>setPlanForm({...planForm,durationDays:e.target.value})} required/></label>}
          <label>Device limit<input type="number" min="1" max="20" value={planForm.deviceLimit} onChange={e=>setPlanForm({...planForm,deviceLimit:e.target.value})} required/></label>
          <label className="consent"><input type="checkbox" checked={planForm.isActive} onChange={e=>setPlanForm({...planForm,isActive:e.target.checked})}/><span>Active and available for new purchases</span></label>
          <div className="order-actions"><button className="button primary">{lang==="ar"?"حفظ الباقة":"Save plan"}</button>{planFormId&&<button type="button" className="button ghost" onClick={()=>setPlanFormId("")}>{lang==="ar"?"إلغاء":"Cancel"}</button>}</div>
        </form>
      </section>}
      {adminSection==="leads"&&<section className="admin-module"><h2>{lang==="ar"?"العملاء المحتملون":"Checkout leads"}</h2><div className="order-actions"><label>Status<select value={leadStatusFilter} onChange={e=>setLeadStatusFilter(e.target.value)}><option value="">All</option>{["new","contacted","checkout_started","lost"].map(value=><option key={value} value={value}>{value}</option>)}</select></label><button className="button ghost small" disabled={leadLoading} onClick={()=>void loadAdminSection("leads")}>{lang==="ar"?"تحديث":"Refresh"}</button></div><div className="orders-list">{adminLeads.length===0?<p>{leadLoading?"Loading…":"No leads found."}</p>:adminLeads.map((lead)=><article className="order-row" key={lead.id}><div><span className={`status-pill ${lead.status}`}>{lead.status}</span><h3>{lead.full_name||lead.email||lead.phone||lead.id}</h3><p>{lead.product_name} · {lead.email||"—"} · {lead.phone||"—"}</p><small>{new Date(lead.created_at).toLocaleString()} · marketing consent: {lead.marketing_consent?"yes":"no"}</small></div><label>Follow-up status<select value={lead.status==="converted"?"checkout_started":lead.status} onChange={e=>void updateLeadStatus(lead.id,e.target.value as Exclude<AdminLead["status"],"converted">)}>{["new","contacted","checkout_started","lost"].map(value=><option key={value} value={value}>{value}</option>)}</select></label></article>)}</div><p className="notice">Lead conversion is not manually set here; order approval is the conversion signal.</p></section>}
      {adminSection==="accounts"&&<section className="admin-module"><h2>{lang==="ar"?"بحث الحسابات والاستحقاقات":"Account search and entitlements"}</h2><form className="admin-form" onSubmit={searchAccounts}><label>Email search<input type="search" value={accountQuery} onChange={e=>setAccountQuery(e.target.value)} maxLength={100}/></label><button className="button primary">{lang==="ar"?"بحث":"Search accounts"}</button></form>
        <div className="orders-list">{adminAccounts.map((account)=><article className="order-row" key={account.id}><div><h3>{account.email||account.id}</h3><small>{account.id} · {account.status||"active"}</small></div><button type="button" className="button ghost small" onClick={()=>void inspectAccount(account)}>{lang==="ar"?"فحص الحساب":"Inspect account"}</button></article>)}</div>
        {accountInspection&&<><h3>{accountInspection.account.email} · {accountInspection.account.status}</h3><label>{lang==="ar"?"السبب الإداري (إلزامي ويُسجل في سجل التدقيق)":"Administrative reason (required and recorded in the audit log)"}<textarea value={accountStatusReason} onChange={e=>setAccountStatusReason(e.target.value)} maxLength={500} required/></label><div className="order-actions"><button type="button" className="button ghost small" disabled={!accountStatusReason.trim()||accountInspection.account.id===authUser?.id&&accountInspection.account.status!=="suspended"} onClick={()=>void setAccountSuspended(accountInspection.account.status!=="suspended")}>{accountInspection.account.status==="suspended"?"Reactivate account":"Suspend account"}</button><button type="button" className="button ghost small" onClick={()=>{setAdminSection("security");void api.adminSecurityEvents({accountId:accountInspection.account.id}).then(result=>setSecurityEvents(result.events)).catch(setErrorSafe)}}>View security events</button></div>
        <h3>Entitlements</h3><div className="orders-list">{accountInspection.entitlements.map((entitlement,index)=>{const value=entitlement as Record<string,unknown>;return <article className="order-row" key={String(value.id??index)}><div><strong>{String(value.plan??"plan")} · {String(value.status??"")}</strong><p>{String(value.id??"")} · product {String(value.product_id??"")}</p><small>{String(value.starts_at??"")} → {String(value.ends_at??"No expiry")}</small></div><label>Revoke reason<input value={entitlementReason} maxLength={500} onChange={e=>setEntitlementReason(e.target.value)}/></label><button type="button" className="text-button danger" onClick={()=>void revokeEntitlement(String(value.id))}>Revoke</button></article>})}</div>
        <form className="admin-form" onSubmit={grantEntitlement}><h3>Grant entitlement</h3><label>Product<select value={grantForm.productId} onChange={e=>setGrantForm({...grantForm,productId:e.target.value,planId:""})} required><option value="">Select product</option>{adminProducts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Plan<select value={grantForm.planId} onChange={e=>setGrantForm({...grantForm,planId:e.target.value})} required><option value="">Select plan</option>{adminProducts.find(item=>item.id===grantForm.productId)?.plans.filter(item=>item.isActive).map(item=><option key={item.id} value={item.id}>{item.displayName} ({item.billingType})</option>)}</select></label><label>Verified payment reference (required for Monthly)<input value={grantForm.paymentReference} maxLength={200} onChange={e=>setGrantForm({...grantForm,paymentReference:e.target.value})}/></label><label>Grant reason<input value={grantForm.reason} maxLength={500} onChange={e=>setGrantForm({...grantForm,reason:e.target.value})} required/></label><button className="button primary">Grant entitlement</button></form>
        <h3>Registered devices</h3><div className="orders-list">{accountInspection.devices.map((device,index)=>{const value=device as Record<string,unknown>;return <article className="order-row" key={`${String(value.device_hash)}-${index}`}><div><strong>{String(value.device_hash)}</strong><small>{String(value.first_seen_at??"")} · last seen {String(value.last_seen_at??"")}</small><small>Product {String(value.product_id??"")} {value.revoked_at?`· revoked ${String(value.revoked_at)}`:""}</small></div>{!value.revoked_at&&<button type="button" className="text-button danger" onClick={()=>void revokeDevice(String(value.device_hash),String(value.product_id))}>Revoke device</button>}</article>})}</div>
        <h3>Admin audit history</h3><div className="orders-list">{accountInspection.audit.map((entry,index)=><pre className="audit-entry" key={index}>{JSON.stringify(entry,null,2)}</pre>)}</div>
        </>}
      </section>}
      {adminSection==="support"&&<section className="admin-module"><h2>{lang==="ar"?"رسائل دعم العملاء":"Customer support messages"}</h2><label>{lang==="ar"?"الطلب":"Order"}<select value={supportOrderId} onChange={e=>void loadSupportMessages(e.target.value)}><option value="">{lang==="ar"?"اختر طلبًا":"Select an order"}</option>{adminOrders.map(item=><option key={item.id} value={item.id}>{item.email} · {item.plan} · {item.status} · {item.id.slice(0,8)}</option>)}</select></label>{supportOrderId&&<><div className="orders-list">{supportMessages.length===0?<p>{lang==="ar"?"لا توجد رسائل بعد.":"No messages yet."}</p>:supportMessages.map((message,index)=><article className="order-row" key={`${message.createdAt}-${index}`}><div><strong>{message.sender}</strong><p>{message.message}</p><small>{new Date(message.createdAt).toLocaleString()}</small></div></article>)}</div><form className="admin-form" onSubmit={sendAdminReply}><label>{lang==="ar"?"رد المسؤول":"Admin reply"}<textarea value={adminReply} onChange={e=>setAdminReply(e.target.value)} maxLength={1000} required/></label><button className="button primary">{lang==="ar"?"إرسال الرد":"Send reply"}</button></form></>}</section>}
      {adminSection==="security"&&<section className="admin-module"><h2>Security events (admin-only)</h2><p className="notice">IP addresses and device details are sensitive telemetry. Review in context; an IP may be shared or change and is not, on its own, evidence of misuse.</p><div className="orders-list">{securityEvents.map((event)=><article className="order-row" key={event.id}><div><strong>{event.event_type} · risk {event.risk_score??"—"}</strong><p>IP {event.ip_address??"unavailable"} · account {event.account_id??"anonymous"}</p><small>{event.product_slug??event.product_id??"—"} · {event.created_at} · expires {event.expires_at??"not set"}</small>{event.device_hash&&<code>{event.device_hash}</code>}</div><details><summary>Event details</summary><pre>{JSON.stringify(event.details,null,2)}</pre>{event.user_agent&&<pre>{event.user_agent}</pre>}</details></article>)}</div>{securityEvents.length===0&&<p>No events returned.</p>}</section>}
      </section>}
    {error && <p className="error-banner">{error}</p>}</main>;
  return <div className="site" dir={lang==="ar"?"rtl":"ltr"}>
    <header className="topbar"><a className="wordmark" href="#" aria-label="MF Plugin" onClick={()=>setView("home")}><span className="logo">MF</span></a>
      <nav><a href="#features">{t.navFeatures}</a><a href="#pricing">{t.navPlans}</a><a href="#how">{t.navHelp}</a><a href="#installation">{t.navInstall}</a></nav><div className="nav-actions">{authUser&&<button className="text-button" onClick={()=>setView("status")}>{authUser.email}</button>}<button className="text-button" onClick={()=>order?setView("status"):void startCheckout(selectedOffer?.code??"")}>{order?t.orderStatus:t.buy}</button>{authUser&&<button className="text-button" onClick={()=>void signOut()}>{t.signOut}</button>}<button className="lang-toggle" onClick={toggleLang}>{lang==="ar"?"EN":"عربي"}</button></div></header>
    {view==="home"&&<><section className="hero"><div className="hero-copy"><span className="eyebrow">{product?.name ?? "MF Plugin"} / {t.heroEyebrow}</span><h1>{t.heroTitle}<br/><em>{t.heroAccent}</em></h1><p>{product?.description || (catalogLoading ? t.catalogUnavailable : t.orderUnavailable)}</p><div className="hero-actions"><a className="button primary" href="#pricing">{t.cta}<span>↗</span></a><a className="button ghost" href="#features">{t.exploreTools}<span aria-hidden="true">↓</span></a></div><div className="hero-facts"><span><i/> {t.compatibility}</span><span><i/> {t.offline}</span></div></div><div className="hero-art" aria-label={t.panelTitle}><div className="art-glow"/><div className="mf-panel"><div className="mf-panel-top"><span className="mf-panel-brand"><span className="mf-panel-mark">M</span><span>{product?.name ?? "MF Plugin"}</span></span><span className="panel-app">Pr</span></div><div className="mf-panel-heading"><div><span className="panel-kicker">PREMIERE PRO / MF</span><h2>{t.panelTitle}</h2><p>{product?.description || t.orderUnavailable}</p></div><span className="panel-ready-dot" aria-hidden="true"/></div><div className="mf-tool-grid">{t.panelItems.map((item,i)=><article className={`mf-tool mf-tool-${i}`} key={item}><span className="mf-tool-icon" aria-hidden="true">{featureIcons[i]}</span><span>{item}</span><b aria-hidden="true">↗</b></article>)}</div><div className="mf-panel-footer"><span><i/> {t.panelStatus}</span><span>MF / PREMIERE PRO</span></div></div><div className="floating-tag tag-one">MF &nbsp; / &nbsp; PREMIERE PRO</div><div className="floating-tag tag-two">01 <span>YOUR CREATIVE FLOW</span></div></div></section>
    <div className="ticker"><span>MF PREMIERE PRO EXTENSION</span><b>✳</b><span>BUILT FOR THE EDIT</span><b>✳</b><span>YOUR TIMELINE, YOUR WAY</span><b>✳</b><span>MF PREMIERE PRO EXTENSION</span></div>
    <section className="feature-section section-wrap" id="features"><div className="section-intro"><span className="eyebrow">{t.sectionLabel} / 01</span><h2>{t.sectionTitle}</h2><p>{product?.description || t.orderUnavailable}</p></div>{productFeatures.length>0?<div className="feature-grid">{productFeatures.map((feature,index)=>{const title=typeof feature==="string"?feature:feature.title;const description=typeof feature==="string"?"":feature.description??"";return title?<article className="feature-card" key={`${title}-${index}`}><span className="feature-index">{new Intl.NumberFormat(lang==="ar"?"ar-EG":"en-US",{minimumIntegerDigits:2,useGrouping:false}).format(index+1)}</span><div className={`feature-icon icon-${index%6}`} aria-hidden="true">{featureIcons[index%featureIcons.length]}</div><h3>{title}</h3>{description&&<p className="feature-description">{description}</p>}<span className="arrow" aria-hidden="true">↗</span></article>:null})}</div>:<p className="notice">{t.catalogUnavailable}</p>}<p className="disclosure">{t.disclosure}</p></section>
    <section className="pricing-section" id="pricing"><div className="section-wrap"><div className="section-intro"><span className="eyebrow">{t.priceKicker} / 02</span><h2>{t.priceTitle}</h2></div>{(catalog?.products.length??0)>1&&<div className="product-picker" role="group" aria-label={lang==="ar"?"اختر منتجًا":"Choose a product"}>{catalog?.products.map((item)=><button type="button" className={`button ${item.slug===product?.slug?"primary":"ghost"}`} key={item.id} onClick={()=>{if(checkoutSessionId)void api.abandonCheckout(checkoutSessionId).catch(()=>undefined);setCheckoutSessionId("");setCheckoutLeadId("");setPrivacyAccepted(false);setProductSlug(item.slug);setPlan(item.plans[0]?.code??"")}}>{item.name}</button>)}</div>}{offers.length>0?<div className="pricing-grid">{offers.map((offer,index)=>{const term=offer.billingType==="lifetime"?(lang==="ar"?"بلا انتهاء":"No expiry"):offer.durationDays?(lang==="ar"?`${offer.durationDays} يومًا`:`${offer.durationDays} days`):(lang==="ar"?"مدة محددة من المنتج":"Term set by product");return <article className={`price-card ${index===1?"featured":""}`} key={offer.id}><span className="eyebrow">{String(index+1).padStart(2,"0")} / {offer.displayName}</span><h3>{offer.displayName}</h3><p>{planDescriptions[offer.code]||product?.description||""}</p><div className="price">{offer.price.toLocaleString(lang==="ar"?"ar-EG":"en-EG")} <small>{offer.currency}</small><span>{term}</span></div><button className={`button ${index===1?"primary":"ghost"} wide`} onClick={()=>void startCheckout(offer.code)}>{t.buy}<span>↗</span></button><div className="price-foot">{offer.deviceLimit} {lang==="ar"?"جهاز":"device(s)"} <i>•</i> {term}</div></article>})}</div>:<p className="notice">{catalogLoading?t.catalogUnavailable:t.orderUnavailable}</p>}</div></section>
    <section className="how-section section-wrap" id="how"><div><span className="eyebrow">NO AUTOMATED PAYMENT CHECKS / 03</span><h2>{t.howTitle}</h2><div className="payment-box"><span>{t.paymentTitle}</span>{whatsappNumber?<><strong>{product?.supportWhatsapp}</strong><button className="text-button" onClick={()=>void openWhatsApp()}>{lang==="ar"?"تواصل عبر واتساب":"Contact on WhatsApp"}</button></>:<small>{t.orderUnavailable}</small>}<a className="text-button" href={`mailto:${supportEmail}`}>{supportEmail}</a><small>{t.paymentNote}</small></div></div><ol>{t.steps.map((step,i)=><li key={step}><span>0{i+1}</span>{step}</li>)}</ol></section>
    <section className="install-section section-wrap" id="installation"><div className="section-intro"><span className="eyebrow">INSTALL MF / 04</span><h2>{t.installTitle}</h2><p>{t.installIntro}</p></div><div className="install-content"><div className="requirements-card"><h3>{t.requirementsTitle}</h3><ul>{t.requirements.map((item)=><li key={item}>{item}</li>)}</ul></div><ol className="install-steps">{t.installSteps.map((step,i)=><li key={step}><span>0{i+1}</span><p>{step}</p></li>)}</ol></div></section>
    {productFaqs.length>0&&<section className="faq-section section-wrap"><div className="section-intro"><span className="eyebrow">ANSWERS / 05</span><h2>{t.faqTitle}</h2></div><div className="faq-list">{productFaqs.filter(item=>typeof item.question==="string"&&typeof item.answer==="string").map((item)=><details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></section>}
    <footer className="footer"><a className="wordmark" href="#" aria-label="MF Plugin"><span className="logo">MF</span></a><span>{product?.name ?? "MF Plugin"}</span><span>© MF / 2026 <button className="admin-dot" aria-label="Admin" title="Admin" onClick={()=>{setView("admin");setAuthMode("signin");setError("")}}>·</button></span></footer></>}
    {view==="order"&&<section className="flow-view"><button className="text-button" onClick={()=>{if(checkoutSessionId)void api.abandonCheckout(checkoutSessionId).catch(()=>undefined);setCheckoutSessionId("");setView("home")}}>← {t.navFeatures}</button><div className="flow-card"><span className="eyebrow">PRIVATE CHECKOUT</span><h1>{t.orderTitle}</h1>{product&&selectedOffer?<><div className="pay-instructions"><strong>{product.name} · {selectedOffer.displayName} · {selectedOffer.price.toLocaleString()} {selectedOffer.currency}</strong><span>{selectedOffer.billingType==="lifetime"?(lang==="ar"?"بلا انتهاء":"No expiry"):`${selectedOffer.durationDays??"—"} ${lang==="ar"?"يومًا":"days"}`} · {selectedOffer.deviceLimit} {lang==="ar"?"جهاز":"device(s)"}</span></div>
      {authMode==="recovery"?<form className="auth-form" onSubmit={requestPasswordReset}><h3>{lang==="ar"?"إعادة تعيين كلمة المرور":"Reset your password"}</h3><label>{lang==="ar"?"البريد الإلكتروني":"Email"}<input type="email" autoComplete="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required/></label><button className="button primary">{lang==="ar"?"إرسال رابط الاستعادة":"Send recovery link"}</button><button type="button" className="text-button" onClick={()=>{setAuthMode("signin");setAuthNotice("");setError("")}}>{lang==="ar"?"العودة لتسجيل الدخول":"Back to sign in"}</button>{authNotice&&<p className="notice">{authNotice}</p>}</form>:authMode==="set-password"?<form className="auth-form" onSubmit={updatePassword}><h3>{lang==="ar"?"تعيين كلمة مرور جديدة":"Set a new password"}</h3><label>{lang==="ar"?"كلمة المرور الجديدة":"New password"}<input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} required/></label><button className="button primary">{lang==="ar"?"تحديث كلمة المرور":"Update password"}</button>{authNotice&&<p className="notice">{authNotice}</p>}</form>:authUser?<div className="notice">{lang==="ar"?"تم تسجيل الدخول باسم":"Signed in as"} {authUser.email} <button type="button" className="text-button" onClick={()=>void signOut()}>{t.signOut}</button></div>:<form className="auth-form" onSubmit={authenticate}><h3>{authMode==="signup"?(lang==="ar"?"إنشاء حساب عميل":"Create customer account"):(lang==="ar"?"تسجيل الدخول":"Customer sign in")}</h3>{authMode==="signup"&&<label>{lang==="ar"?"الاسم":"Name"}<input autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)} required/></label>}<label>{lang==="ar"?"البريد الإلكتروني":"Email"}<input type="email" autoComplete="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required/></label><label>{t.password}<input type="password" autoComplete={authMode==="signup"?"new-password":"current-password"} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} minLength={8} required/></label><button className="button primary">{authMode==="signup"?(lang==="ar"?"إنشاء حساب":"Create account"):t.signIn}</button>{authMode==="signin"&&<button type="button" className="text-button" onClick={()=>{setAuthMode("recovery");setAuthNotice("");setError("")}}>{lang==="ar"?"نسيت كلمة المرور؟":"Forgot password?"}</button>}<button type="button" className="text-button" onClick={()=>{setAuthMode(authMode==="signup"?"signin":"signup");setAuthNotice("");setError("")}}>{authMode==="signup"?(lang==="ar"?"لديك حساب؟ سجّل الدخول":"Already registered? Sign in"):(lang==="ar"?"إنشاء حساب جديد":"New customer? Create an account")}</button>{authNotice&&<p className="notice">{authNotice}</p>}</form>}
      {authMode!=="recovery"&&authMode!=="set-password"&&<form onSubmit={createOrder}><label>{t.contact}<input value={contact} onChange={e=>setContact(e.target.value)} placeholder={t.contactPlaceholder} required minLength={7}/></label>{privacyNoticeText&&privacyNoticeVersion&&privacyNoticeVersion.length<=40?<><details className="privacy-notice"><summary>{lang==="ar"?"إشعار الخصوصية":"Privacy notice"}</summary><p>{privacyNoticeText}</p></details><label className="consent"><input type="checkbox" checked={privacyAccepted} onChange={e=>setPrivacyAccepted(e.target.checked)} required/><span>{lang==="ar"?"أوافق على إشعار الخصوصية الموضح أعلاه.":"I agree to the privacy notice shown above."}</span></label></>:<p className="notice">{t.privacyUnavailable}</p>}<label className="consent"><input type="checkbox" checked={marketingConsent} onChange={e=>setMarketingConsent(e.target.checked)}/><span>{lang==="ar"?"أوافق اختياريًا على تلقي رسائل تسويقية مستقبلية.":"Optional: I agree to receive future marketing messages."}</span></label><button className="button primary wide" disabled={!authUser||!privacyNoticeText||!privacyNoticeVersion||privacyNoticeVersion.length>40}>{t.submit}<span>↗</span></button><small>{t.pendingWarning}</small><small>{t.whatsappRedirectNotice}</small></form>}
      {whatsappNumber&&<button type="button" className="button ghost wide" onClick={()=>void openWhatsApp()}>{lang==="ar"?"متابعة عبر واتساب":"Contact on WhatsApp"}</button>}</>:<p className="notice">{t.orderUnavailable}</p>}</div></section>}
    {view==="status"&&<section className="flow-view"><button className="text-button" onClick={()=>setView("home")}>← MF</button><div className="flow-card"><span className="eyebrow">PRIVATE ORDER HISTORY</span><h1>{t.orderStatus}</h1>{authUser?<><p>{authUser.email} <button className="text-button" onClick={()=>void signOut()}>{t.signOut}</button></p>{orderHistory.length>0&&<div className="orders-list"><h3>{t.accessToken}</h3>{orderHistory.map((item)=><button type="button" className="text-button" key={item.id} onClick={()=>{setOrder({id:item.id});sessionStorage.setItem("mf-order-id",item.id)}}>{item.id} · {item.plan} · {item.status} · {item.price} {item.currency}</button>)}</div>}{order?<><p>{t.orderCode}: <code>{order.id}</code></p><p className="status-message">{status==="approved"?t.approved:status==="rejected"?t.rejected:orderData?.reviewNote||t.pending}</p>{orderData&&<p>{orderData.plan} · {orderData.priceEgp} {orderData.currency}</p>}{orderHistory.some(item=>item.id===order.id&&item.status==="uploading"&&!item.receiptSubmitted)&&<form onSubmit={upload}><label>{t.receipt}<input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" required/></label><button className="button primary wide">{t.submitReceipt}</button></form>}<div className="divider"/><h3>{t.message}</h3><div className="chat-box">{(orderData?.messages??[]).map((message,index)=><p className={`chat-line ${message.sender}`} key={`${message.createdAt}-${index}`}><b>{message.sender}:</b> {message.message}</p>)}</div><form className="chat-compose" onSubmit={sendCustomerMessage}><input value={messageText} onChange={e=>setMessageText(e.target.value)} maxLength={1000} placeholder={t.message}/><button className="button ghost">{t.send}</button></form></>:<p className="notice">{orderHistory.length? (lang==="ar"?"اختر طلبًا لعرض حالته.":"Select an order to view its status."):(lang==="ar"?"لا توجد طلبات لهذا الحساب بعد.":"There are no orders for this account yet.")}</p>}</>:<><h2>{lang==="ar"?"سجّل الدخول لعرض طلباتك":"Sign in to view your orders"}</h2><form className="auth-form" onSubmit={customerLogin}><label>{lang==="ar"?"البريد الإلكتروني":"Email"}<input type="email" autoComplete="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required/></label><label>{t.password}<input type="password" autoComplete="current-password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required/></label><button className="button primary">{t.signIn}</button></form><button type="button" className="text-button" onClick={()=>{setAuthMode("recovery");setView("order");setError("")}}>{lang==="ar"?"نسيت كلمة المرور؟":"Forgot password?"}</button></>}{error&&<p className="error-banner">{error}</p>}</div></section>}
    {view === "home" && <div className="support-tools" dir={lang === "ar" ? "rtl" : "ltr"}>
      {whatsappNumber&&<button type="button" className="support-whatsapp" onClick={()=>void openWhatsApp()} aria-label={lang === "ar" ? "تواصل معنا على واتساب" : "Contact us on WhatsApp"} title={lang === "ar" ? "واتساب" : "WhatsApp"}>
        <svg className="support-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3 20l.9-4.7a8.5 8.5 0 1 1 16.6-3.6Z"/><path d="M8.4 8.1c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.8 1.8c.1.2.1.4-.1.6l-.6.7c-.2.2-.2.4-.1.6.6 1 1.4 1.8 2.4 2.4.2.1.4.1.6-.1l.8-.9c.2-.2.4-.2.6-.1l1.7.8c.3.1.4.3.4.5 0 .3-.1 1.1-.7 1.6-.5.5-1.2.7-1.9.6-1.1-.1-2.6-.8-4.1-2.1-1.4-1.2-2.3-2.8-2.6-3.9-.3-1 .1-1.9.6-2.4Z"/></svg>
      </button>}
      {botOpen && <section className="support-chat" aria-label={bot.title}>
        <header><div><span className="support-online-dot" aria-hidden="true"/><strong>{bot.title}</strong></div><button type="button" onClick={() => setBotOpen(false)} aria-label={lang === "ar" ? "إغلاق المحادثة" : "Close chat"}>×</button></header>
        <div className="support-chat-messages" aria-live="polite">
          <p className="support-bot-message">{bot.welcome}</p>
          {botMessages.map((message) => <p className={`support-chat-message ${message.sender}`} key={message.id}>{message.text}</p>)}
        </div>
        <div className="support-topics">{bot.topics.map((topic) => <button type="button" key={topic.id} onClick={() => answerBot(topic.label, topic)}>{topic.label}</button>)}</div>
        <form className="support-chat-form" onSubmit={askBot}><input value={botInput} onChange={(event) => setBotInput(event.target.value)} placeholder={bot.placeholder} maxLength={300} aria-label={bot.placeholder}/><button type="submit" disabled={!botInput.trim()}>{bot.send}</button></form>
      </section>}
      <button className="support-chat-toggle" type="button" onClick={() => setBotOpen((open) => !open)} aria-expanded={botOpen} aria-label={botOpen ? (lang === "ar" ? "إغلاق مساعد MF" : "Close MF assistant") : (lang === "ar" ? "افتح مساعد MF" : "Open MF assistant")} title={botOpen ? (lang === "ar" ? "إغلاق المساعد" : "Close assistant") : (lang === "ar" ? "مساعد MF" : "MF assistant")}>
        {botOpen ? <span className="support-action-close" aria-hidden="true">×</span> : <svg className="support-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.5-.8L4 20l1.2-4.2a7.5 7.5 0 1 1 14.8-4.3Z"/><path d="M8 11h8M8 14h5"/></svg>}
      </button>
    </div>}
    {error&&view!=="status"&&<div className="toast">{error}<button onClick={()=>setError("")}>×</button></div>}
  </div>;
}
