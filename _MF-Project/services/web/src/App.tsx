import { FormEvent, useEffect, useState } from "react";
import { api, apiUrl, Catalog } from "./api";

type Lang = "ar" | "en";
type BotMessage = { id: number; sender: "user" | "bot"; text: string };
type BotTopic = { id: string; label: string; keywords: string[]; answer: string };
const featureIcons = ["↗", "Aa", "✳", "T", "▦", "◫", "✦", "♫", "Ⅲ", "◇", "◌", "▣", "⌖", "⌘", "AI", "＋"];
const WHATSAPP_NUMBER = "201016022870";
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
      { id: "plans", label: "Plans and pricing", keywords: ["price", "pricing", "plan", "monthly", "lifetime", "subscription", "cost"], answer: "The site offers Monthly and Lifetime plans. Monthly is listed for one active device; Lifetime for up to three. See the Plans section for the currently displayed prices and message us to confirm availability." },
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
      { id: "plans", label: "ما الباقات والأسعار؟", keywords: ["سعر", "الأسعار", "السعر", "باقة", "اشتراك", "شهري", "مدى الحياة", "تكلفة", "lifetime", "monthly"], answer: "يعرض الموقع باقة شهرية وباقة مدى الحياة. الشهرية لجهاز نشط واحد، ومدى الحياة حتى ٣ أجهزة. راجع قسم الباقات للأسعار المعروضة حاليًا، وراسلنا لتأكيد التوفر." },
      { id: "license", label: "هل أحتاج إلى حساب؟", keywords: ["حساب", "تسجيل الدخول", "اسجل", "تسجيل", "ترخيص", "صلاحية", "تفعيل", "تجديد"], answer: "بحسب متطلبات الباقات، الاشتراك الشهري مصمم ليتطلب حسابًا والتحقق من صلاحية الاشتراك، بينما نسخة مدى الحياة مصممة للعمل دون حساب. لكن الإصدار الموثق وتسليم التراخيص غير مفعّلين بعد، لذلك لا يمكن تأكيد هذا السلوك في نسخة متاحة للاستخدام حاليًا." },
      { id: "payment", label: "كيف أدفع وأستلم؟", keywords: ["دفع", "ادفع", "تحويل", "إيصال", "ايصال", "شراء", "استلام", "تنزيل", "تحميل"], answer: "تتم مراجعة الدفع يدويًا؛ رفع صورة الإيصال لا يعني تأكيد الدفع، إذ يتحقق شخص من التحويل. تنزيل المثبّت الخاص غير مفعّل حتى تجهيز إصدار موثّق." },
      { id: "install", label: "كيف أثبّت MF؟", keywords: ["تثبيت", "اثبت", "تثبيت", "setup", "installer", "افتح", "المثبت", "المثبّت"], answer: "تُثبّت MF كإضافة داخل Premiere Pro على Windows. أغلق Premiere Pro أثناء التثبيت، وشغّل المثبّت الرسمي عند توفره، ثم أعد تشغيل Premiere وافتح Window ← Extensions ← MF. رابط الإصدار الموثّق غير مفعّل حاليًا." },
      { id: "ai", label: "هل ترفع أدوات AI ملفاتي؟", keywords: ["ذكاء", "اصطناعي", "ai", "خصوصية", "خصوصيه", "رفع", "ملفاتي", "ملفاتي"], answer: "أدوات الذكاء الاصطناعي اختيارية. قد تحتاج بعضها إلى إعداد مزوّد خدمة وموافقتك قبل رفع الوسائط. راجع تفاصيل المزوّد والرفع قبل استخدام أي ميزة سحابية." }
    ]
  }
};
type CustomerOrder =
  | { id: string; token: string; demo: false }
  | { id: string; demo: true; plan: "monthly" | "lifetime"; receiptSubmitted: boolean };

const isLocalPreview = () =>
  typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

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
    monthlyDesc: "For the editor in motion. One active device.", lifetimeDesc: "One purchase. Up to three active devices.", buy: "Choose plan",
    howTitle: "A human-reviewed purchase.", steps: ["Choose your plan and send a transfer", "Upload the receipt to your private order page", "Our team verifies the payment independently", "Your access appears securely after approval"],
    paymentTitle: "Manual payment", paymentNote: "Confirm the recipient in your payment app before sending.", wallet: "InstaPay or Vodafone Cash",
    orderTitle: "Start your order", contact: "Contact method (phone or email)", contactPlaceholder: "How can we reach you?", plan: "Plan", receipt: "Payment receipt image (JPEG, PNG, WebP · max 5 MB)", submit: "Create private order", pendingWarning: "An uploaded image does not confirm payment. Your order stays pending until a person verifies the transfer.", whatsappRedirectNotice: "After your order is created, WhatsApp will open with your order reference, plan, and contact method prefilled. No receipt or private access key is sent.", message: "Message our team", send: "Send message",
    orderCreated: "Private order created", accessToken: "Save this private access key now. It is shown only once.", orderCode: "Order reference", submitReceipt: "Submit receipt", checkOrder: "Check order", claimAccess: "Retrieve approved access once", pending: "Pending manual payment review", paymentNotReceived: "Payment not received yet", approved: "Payment approved", rejected: "Payment rejected", orderStatus: "Order status",
    adminEntry: "•", adminTitle: "Administrator access", username: "Username", password: "Password", signIn: "Sign in", dashboard: "Review dashboard", signOut: "Sign out", pendingCount: "Pending", approvedCount: "Approved", rejectedCount: "Rejected", monthlyRevenue: "Monthly sales", lifetimeRevenue: "Lifetime sales", activeLicenses: "Active licenses", activeDevices: "Active devices", activeSubs: "Active monthly subscriptions", expiredSubs: "Expired monthly subscriptions", licenseManagement: "License management", revoke: "Revoke license", reviewAction: "Approve verified payment", notReceived: "Payment not received", reject: "Reject", verify: "I independently verified the transfer", noOrders: "No orders yet.", whatsappOff: "WhatsApp automation is disabled. Review orders here.",
    footer: "A focused toolkit for Premiere Pro.", socialLinksLabel: "Social media and contact", whatsapp: "WhatsApp", disclosure: "Optional cloud AI services may require separate provider credentials and your confirmation before media upload.",     err: "Something went wrong", catalogUnavailable: "Pricing and payment details are temporarily unavailable.",
    orderUnavailable: "Order service is offline. Prices are shown for reference; ordering will be available when the service is connected.",
    localDemoNotice: "Local preview only — no real order is created, do not send a payment, and any test receipt stays on this device.",
    localDemoPayment: "Local demo — payment details are hidden",
    createDemoOrder: "Start local demo",
    demoCreatedTitle: "Local demo order",
    demoOrderStatus: "Demo only — payment is not sent, accepted, or reviewed.",
    demoReceiptNote: "Choose a test image to preview receipt submission. It will not be uploaded or stored.",
    demoReceiptSelected: "Test image selected locally. No receipt was sent.",
    demoSubmitReceipt: "Simulate receipt selection",
    installTitle: "Download & installation", installIntro: "MF installs as a Premiere Pro extension using the Windows installer. The actual download link will be enabled after a verified release is configured.",
    requirementsTitle: "What you need", requirements: ["Adobe Premiere Pro 2023 or newer (the extension manifest declares 2023+ compatibility).", "The documented installer is a Windows .exe; macOS support has not been confirmed.", "Keep Premiere Pro closed while installing or updating MF."],
    installSteps: ["After your payment is independently approved, get the official MF-Setup-2.5.1.exe from the private order page when release delivery is enabled.", "Run the installer and follow Next → Install. Administrator access is not required according to the product guide.", "Restart Premiere Pro, then open Window → Extensions → MF.", "In MF Settings, run the installation check and confirm the required components are present."],
    faqTitle: "Frequently asked questions", portfolioLink: "Visit Mahmoud's portfolio", faqs: [
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
    monthlyDesc: "للمونتير الذي يعمل باستمرار. جهاز نشط واحد.", lifetimeDesc: "شراء مرة واحدة. حتى ٣ أجهزة نشطة.", buy: "اختر الباقة",
    howTitle: "مراجعة بشرية للدفع.", steps: ["اختر الباقة وأرسل التحويل", "ارفع الإيصال في صفحة طلبك الخاصة", "نتحقق من التحويل بشكل مستقل", "يظهر وصولك بأمان بعد الموافقة"],
    paymentTitle: "الدفع اليدوي", paymentNote: "تأكد من اسم المستلم داخل تطبيق الدفع قبل التحويل.", wallet: "InstaPay أو Vodafone Cash",
    orderTitle: "ابدأ طلبك", contact: "وسيلة التواصل (هاتف أو بريد)", contactPlaceholder: "كيف يمكننا التواصل معك؟", plan: "الباقة", receipt: "صورة إيصال الدفع (JPEG أو PNG أو WebP · حتى ٥ ميجابايت)", submit: "إنشاء طلب خاص", pendingWarning: "رفع الصورة لا يؤكد الدفع. يظل طلبك قيد الانتظار حتى يتحقق شخص من التحويل.", whatsappRedirectNotice: "بعد إنشاء الطلب، سيفتح واتساب برسالة جاهزة تتضمن رقم الطلب والباقة ووسيلة التواصل. لن يُرسل الإيصال أو مفتاح الوصول الخاص.", message: "راسل فريقنا", send: "إرسال الرسالة",
    orderCreated: "تم إنشاء الطلب الخاص", accessToken: "احفظ مفتاح الوصول الخاص الآن. سيظهر مرة واحدة فقط.", orderCode: "رقم الطلب", submitReceipt: "إرسال الإيصال", checkOrder: "حالة الطلب", claimAccess: "استلام الوصول المعتمد مرة واحدة", pending: "بانتظار مراجعة الدفع يدويًا", paymentNotReceived: "لم يصل الدفع بعد", approved: "تمت الموافقة على الدفع", rejected: "تم رفض الدفع", orderStatus: "حالة الطلب",
    adminEntry: "•", adminTitle: "دخول الإدارة", username: "اسم المستخدم", password: "كلمة المرور", signIn: "دخول", dashboard: "لوحة مراجعة الطلبات", signOut: "خروج", pendingCount: "قيد المراجعة", approvedCount: "مقبول", rejectedCount: "مرفوض", monthlyRevenue: "مبيعات شهرية", lifetimeRevenue: "مبيعات مدى الحياة", activeLicenses: "تراخيص نشطة", activeDevices: "أجهزة نشطة", activeSubs: "اشتراكات شهرية نشطة", expiredSubs: "اشتراكات شهرية منتهية", licenseManagement: "إدارة التراخيص", revoke: "إلغاء الترخيص", reviewAction: "موافقة بعد التحقق", notReceived: "الدفع لم يصل", reject: "رفض", verify: "تحققت بنفسي من التحويل", noOrders: "لا توجد طلبات بعد.", whatsappOff: "أتمتة واتساب معطلة. راجع الطلبات هنا.",
    footer: "أدوات عملية لـ Premiere Pro.", socialLinksLabel: "حسابات التواصل ورقم التواصل", whatsapp: "واتساب", disclosure: "قد تتطلب خدمات الذكاء الاصطناعي السحابية الاختيارية مفاتيح من مزود الخدمة وموافقتك قبل رفع الوسائط.", err: "حدث خطأ", catalogUnavailable: "الأسعار وبيانات الدفع غير متاحة مؤقتًا.",
    orderUnavailable: "خدمة الطلبات غير متصلة حاليًا. الأسعار ظاهرة للمعاينة، وسيصبح الطلب متاحًا عند توصيل الخدمة.",
    localDemoNotice: "معاينة محلية فقط — لن يُنشأ طلب حقيقي. لا ترسل أي مبلغ، وأي إيصال تجريبي سيبقى على هذا الجهاز.",
    localDemoPayment: "معاينة محلية — بيانات الدفع مخفية",
    createDemoOrder: "ابدأ المعاينة المحلية",
    demoCreatedTitle: "طلب تجريبي محلي",
    demoOrderStatus: "معاينة فقط — لم يتم إرسال الدفع أو استلامه أو مراجعته.",
    demoReceiptNote: "اختر صورة تجريبية لمعاينة رفع الإيصال. لن تُرفع الصورة أو تُحفظ.",
    demoReceiptSelected: "تم اختيار صورة تجريبية محليًا. لم يُرسل أي إيصال.",
    demoSubmitReceipt: "محاكاة اختيار الإيصال",
    installTitle: "تنزيل البلاجن وتثبيته", installIntro: "يُثبّت MF كإضافة داخل Premiere Pro باستخدام ملف تثبيت Windows. رابط التنزيل الفعلي سيتاح بعد تجهيز نسخة إصدار موثّقة.",
    requirementsTitle: "المتطلبات", requirements: ["Adobe Premiere Pro إصدار 2023 أو أحدث (ملف الإضافة يعلن التوافق من 2023 فما بعد).", "ملف التثبيت الموثق بصيغة EXE لنظام Windows؛ لم يتم تأكيد دعم macOS.", "أغلق Premiere Pro أثناء تثبيت MF أو تحديثه."],
    installSteps: ["بعد التحقق من التحويل يدويًا، استلم ملف MF-Setup-2.5.1.exe الرسمي من صفحة الطلب الخاصة عند تفعيل تنزيل الإصدار.", "شغّل المثبّت واتبع Next ثم Install. دليل المنتج يذكر أن صلاحيات المسؤول غير مطلوبة.", "أعد تشغيل Premiere Pro، ثم افتح Window ← Extensions ← MF.", "من إعدادات MF شغّل فحص التثبيت وتأكد من وجود المكونات المطلوبة."],
    faqTitle: "أسئلة شائعة", portfolioLink: "زيارة موقعي الشخصي", faqs: [
      ["هل MF برنامج مونتاج مستقل؟", "لا. MF لوحة إضافة تعمل من داخل Adobe Premiere Pro."],
      ["هل يحتاج MF إلى إنترنت؟", "دليل المنتج يذكر أن أدوات المونتاج الأساسية تعمل دون إنترنت. أما التحقق من ترخيص الاشتراك المطلوب فما زال يحتاج إلى استكمال قبل تفعيل الاشتراكات."],
      ["متى أستلم ملف التثبيت؟", "بعد مراجعة التحويل والموافقة عليه. التنزيل الخاص لن يتفعّل قبل تجهيز إصدار موثّق."],
      ["كيف يتم تأكيد الدفع؟", "ترفع الإيصال في صفحة طلبك الخاصة، ثم يراجع المسؤول التحويل بشكل مستقل. رفع الصورة وحده لا يعني قبول الدفع."]
    ]
  }
};

const publicCatalog: Catalog = {
  plans: [
    { id: "monthly", price: 200, deviceLimit: 1, durationDays: 30 },
    { id: "lifetime", price: 1500, deviceLimit: 3, durationDays: null }
  ],
  paymentMethods: ["InstaPay", "Vodafone Cash"],
  paymentNumber: "01016022870",
  currency: "EGP"
};

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<"home"|"order"|"status"|"admin">("home");
  const [plan, setPlan] = useState<"monthly"|"lifetime">("monthly");
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [status, setStatus] = useState("");
  const [secret, setSecret] = useState("");
  const [orderData, setOrderData] = useState<any>(null);
  const [messageText, setMessageText] = useState("");
  const [threadId, setThreadId] = useState("");
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [dash, setDash] = useState<any>(null);
  const [catalog, setCatalog] = useState<Catalog>(publicCatalog);
  const [catalogAvailable, setCatalogAvailable] = useState(false);
  const [localDemoEnabled, setLocalDemoEnabled] = useState(false);
  const [botOpen, setBotOpen] = useState(false);
  const [botInput, setBotInput] = useState("");
  const [botMessages, setBotMessages] = useState<BotMessage[]>([]);
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const t = copy[lang];
  const bot = botKnowledge[lang];
  const toggleLang = () => setLang(lang === "ar" ? "en" : "ar");
  const setErrorSafe = (e: unknown) => setError(e instanceof Error ? e.message : t.err);
  const monthlyOffer = catalog.plans.find((item) => item.id === "monthly");
  const lifetimeOffer = catalog.plans.find((item) => item.id === "lifetime");
  const paymentDetails = `${catalog.paymentMethods.join(" or ")} · ${catalog.paymentNumber}`;
  useEffect(() => {
    api.catalog().then((liveCatalog) => { setCatalog(liveCatalog); setCatalogAvailable(true); })
      .catch(() => { setCatalogAvailable(false); setLocalDemoEnabled(isLocalPreview()); });
  }, []);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mf-order");
      if (saved) setOrder(JSON.parse(saved) as CustomerOrder);
    } catch { sessionStorage.removeItem("mf-order"); }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; }, [lang]);
  useEffect(() => {
    if (view === "status" && order?.demo) {
      setStatus("pending");
      setOrderData({ status: "pending", plan: order.plan, receiptSubmitted: order.receiptSubmitted });
    } else if (view === "status" && order && !order.demo) {
      api.order(order.id, order.token).then((r) => { setStatus(r.status); setOrderData(r); }).catch(setErrorSafe);
    }
    if (view === "admin" && isAdmin) api.overview().then(setDash).catch(setErrorSafe);
  }, [view, isAdmin]);
  function choosePlanOnWhatsApp(selectedPlan: "monthly" | "lifetime") {
    if (!catalogAvailable) {
      if (localDemoEnabled) {
        setPlan(selectedPlan);
        setView("order");
      } else {
        setError(t.orderUnavailable);
      }
      return;
    }
    const offer = catalog.plans.find((item) => item.id === selectedPlan);
    const planName = selectedPlan === "monthly" ? t.monthly : t.lifetime;
    const message = [
      lang === "ar" ? "مرحبًا، أريد الاشتراك في MF." : "Hello, I am interested in MF.",
      `${t.plan}: ${planName}`,
      offer ? `${lang === "ar" ? "السعر" : "Price"}: ${offer.price} ${catalog.currency}` : "",
      `${t.paymentTitle}: ${catalog.paymentMethods.join(" / ")} · ${catalog.paymentNumber}`,
      lang === "ar" ? "من فضلك أرسل لي خطوات إتمام الاشتراك." : "Please send me the steps to complete my purchase."
    ].filter(Boolean).join("\n");
    window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`);
  }
  function answerBot(question: string, topic: BotTopic) {
    const nextId = Date.now();
    setBotMessages((messages) => [...messages,
      { id: nextId, sender: "user", text: question },
      { id: nextId + 1, sender: "bot", text: topic.answer }
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
      { id: nextId + 1, sender: "bot", text: topic?.answer ?? bot.fallback }
    ]);
    setBotInput("");
  }
  async function createOrder(e: FormEvent) {
    e.preventDefault(); setError("");
    if (!catalogAvailable && localDemoEnabled) {
      const demoOrder: CustomerOrder = {
        id: `DEMO-${crypto.randomUUID()}`,
        demo: true,
        plan,
        receiptSubmitted: false
      };
      setOrder(demoOrder);
      setStatus("pending");
      setOrderData({ status: "pending", plan, receiptSubmitted: false });
      sessionStorage.setItem("mf-order", JSON.stringify(demoOrder));
      setView("status");
      return;
    }
    try {
      const created = await api.createOrder({ plan, contact, locale: lang });
      const newOrder: CustomerOrder = { id: created.orderId, token: created.accessToken, demo: false };
      setOrder(newOrder);
      sessionStorage.setItem("mf-order", JSON.stringify(newOrder));
      setView("status");
      const selectedPlan = catalog.plans.find((item) => item.id === plan);
      const message = [
        lang === "ar" ? "مرحبًا، أنشأت طلبًا جديدًا لمنتج MF." : "Hello, I created a new MF order.",
        `${t.orderCode}: ${created.orderId}`,
        `${t.plan}: ${plan === "monthly" ? t.monthly : t.lifetime}`,
        selectedPlan ? `${lang === "ar" ? "السعر" : "Price"}: ${selectedPlan.price} ${catalog.currency}` : "",
        `${t.contact}: ${contact}`,
        `${t.paymentTitle}: ${catalog.paymentMethods.join(" / ")} · ${catalog.paymentNumber}`,
        lang === "ar" ? "يرجى تأكيد بيانات الدفع والخطوات التالية. لم أرسل إيصال الدفع بعد." : "Please confirm the payment details and next steps. I have not sent a payment receipt yet."
      ].filter(Boolean).join("\n");
      window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`);
    } catch (e) { setErrorSafe(e); }
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!order) return;
    const file = (new FormData(e.currentTarget).get("receipt")) as File;
    if (!file?.size) return;
    if (order.demo) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        setError(lang === "ar" ? "اختر صورة JPEG أو PNG أو WebP بحجم لا يتجاوز 5 ميجابايت." : "Choose a JPEG, PNG, or WebP image no larger than 5 MB.");
        return;
      }
      const updatedOrder: CustomerOrder = { ...order, receiptSubmitted: true };
      setOrder(updatedOrder);
      setOrderData({ status: "pending", plan: order.plan, receiptSubmitted: true });
      sessionStorage.setItem("mf-order", JSON.stringify(updatedOrder));
      setStatus("pending");
      setError("");
      e.currentTarget.reset();
      return;
    }
    try { await api.uploadReceipt(order.id, order.token, file); setStatus("pending"); setError(""); }
    catch (e) { setErrorSafe(e); }
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    try { await api.login(adminName, adminPassword); setIsAdmin(true); setError(""); }
    catch (e) { setErrorSafe(e); }
  }
  async function refresh() { try { setDash(await api.overview()); } catch (e) { setErrorSafe(e); setIsAdmin(false); } }
  async function review(id: string, decision: string) {
    try {
      const verified = decision === "approve" && window.confirm(t.verify);
      if (decision === "approve" && !verified) return;
      await api.review(id, decision, verified); await refresh();
    } catch (e) { setErrorSafe(e); }
  }
  async function sendCustomerMessage(e: FormEvent) {
    e.preventDefault(); if (!order || order.demo || !messageText.trim()) return;
    try { await api.customerMessage(order.id, order.token, messageText); setMessageText(""); const fresh = await api.order(order.id, order.token); setOrderData(fresh); }
    catch (e) { setErrorSafe(e); }
  }
  async function openThread(id: string) {
    try { const response = await api.adminMessages(id); setThreadId(id); setThreadMessages(response.messages); }
    catch (e) { setErrorSafe(e); }
  }
  async function sendAdminMessage(e: FormEvent) {
    e.preventDefault(); if (!threadId || !replyText.trim()) return;
    try { await api.adminMessage(threadId, replyText); setReplyText(""); await openThread(threadId); }
    catch (e) { setErrorSafe(e); }
  }
  async function revokeLicense(id: string) {
    if (!window.confirm(t.revoke)) return;
    try { await api.revokeLicense(id); await refresh(); }
    catch (e) { setErrorSafe(e); }
  }
  if (view === "admin") return <main className="admin-page" dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="admin-top"><button className="text-button" onClick={toggleLang}>{lang === "ar" ? "EN" : "عربي"}</button><span className="brand-mini">MF / ADMIN</span></div>
    {!isAdmin ? <form className="admin-login panel" onSubmit={login}><span className="eyebrow">PRIVATE WORKSPACE</span><h1>{t.adminTitle}</h1>
      <label>{t.username}<input autoComplete="username" value={adminName} onChange={e=>setAdminName(e.target.value)} required /></label>
      <label>{t.password}<input type="password" autoComplete="current-password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} required /></label>
      <button className="button primary">{t.signIn}</button><button type="button" className="text-button" onClick={()=>setView("home")}>← {t.navFeatures}</button></form> :
      <section className="dashboard"><div className="dash-heading"><div><span className="eyebrow">MF / PRIVATE</span><h1>{t.dashboard}</h1></div><button className="button ghost" onClick={async()=>{await api.logout();setIsAdmin(false);setDash(null)}}>{t.signOut}</button></div>
      {dash && <><div className="metric-grid">{[[t.pendingCount,dash.metrics.pendingOrders],[t.approvedCount,dash.metrics.approvedOrders],[t.rejectedCount,dash.metrics.rejectedOrders],[t.monthlyRevenue,`${dash.metrics.monthlyRevenue||0} EGP`],[t.lifetimeRevenue,`${dash.metrics.lifetimeRevenue||0} EGP`],[t.activeLicenses,dash.activeLicenses],[t.activeDevices,dash.activeDevices],[t.activeSubs,dash.activeMonthlySubscriptions],[t.expiredSubs,dash.expiredMonthlySubscriptions]].map(([label,value])=><article className="metric" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <p className="notice">{t.whatsappOff}</p><div className="orders-list">{dash.orders.map((o:any)=><article className="order-row" key={o.id}><div><span className={`status-pill ${o.status}`}>{o.status}</span><h3>{o.plan} · {o.priceEgp} EGP</h3><p>{o.contact}</p><small>{o.id}</small></div><div className="order-actions"><button className="text-button" onClick={async()=>{const response=await fetch(apiUrl(`/admin/orders/${o.id}/receipt`),{credentials:"include"}); if(response.ok){const url=URL.createObjectURL(await response.blob());window.open(url,"_blank","noopener")}}}>{lang==="ar"?"عرض الإيصال":"View receipt"}</button><button className="button ghost small" onClick={()=>openThread(o.id)}>{lang==="ar"?"المحادثة":"Chat"}</button>{o.status==="pending"&&<><button className="button primary small" onClick={()=>review(o.id,"approve")}>{t.reviewAction}</button><button className="button ghost small" onClick={()=>review(o.id,"not_received")}>{t.notReceived}</button><button className="text-button danger" onClick={()=>review(o.id,"reject")}>{t.reject}</button></>}</div>{threadId===o.id&&<form className="thread-form" onSubmit={sendAdminMessage}><div>{threadMessages.map((m:any,i:number)=><p className={`chat-line ${m.sender}`} key={i}><b>{m.sender}:</b> {m.message}</p>)}</div><input value={replyText} onChange={e=>setReplyText(e.target.value)} maxLength={1000} placeholder={t.message}/><button className="button primary small">{t.send}</button></form>}</article>)}</div><h2 className="license-heading">{t.licenseManagement}</h2><div className="orders-list">{dash.licenses.map((license:any)=><article className="license-row" key={license.id}><div><strong>{license.type}</strong><p>{license.id}</p><small>{license.revokedAt?`REVOKED · ${license.revokedAt}`:license.expiresAt?`EXPIRES · ${license.expiresAt}`:"LIFETIME / ACTIVE"}</small></div>{!license.revokedAt&&<button className="text-button danger" onClick={()=>revokeLicense(license.id)}>{t.revoke}</button>}</article>)}</div></>}</section>}
    {error && <p className="error-banner">{error}</p>}</main>;
  return <div className="site" dir={lang==="ar"?"rtl":"ltr"}>
    <header className="topbar"><a className="wordmark" href="#" aria-label="MF Premiere Pro" onClick={()=>setView("home")}><span className="logo">MF</span></a>
      <nav><a href="#features">{t.navFeatures}</a><a href="#pricing">{t.navPlans}</a><a href="#how">{t.navHelp}</a><a href="#installation">{t.navInstall}</a></nav><div className="nav-actions"><button className="text-button" onClick={()=>setView(order?"status":"order")}>{order?t.orderStatus:t.buy}</button><button className="lang-toggle" onClick={toggleLang}>{lang==="ar"?"EN":"عربي"}</button></div></header>
    {view==="home"&&<><section className="hero"><div className="hero-copy"><span className="eyebrow">{t.heroEyebrow}</span><h1>{t.heroTitle}<br/><em>{t.heroAccent}</em></h1><p>{t.heroText}</p><div className="hero-actions"><a className="button primary" href="#pricing">{t.cta}<span>↗</span></a><a className="button ghost" href="#features">{t.exploreTools}<span aria-hidden="true">↓</span></a></div><div className="hero-facts"><span><i/> {t.compatibility}</span><span><i/> {t.offline}</span></div></div><div className="hero-art" aria-label={t.panelTitle}><div className="art-glow"/><div className="mf-panel"><div className="mf-panel-top"><span className="mf-panel-brand"><span className="mf-panel-mark">M</span><span>{t.panelLabel}</span></span><span className="panel-app">Pr</span></div><div className="mf-panel-heading"><div><span className="panel-kicker">PREMIERE PRO / MF</span><h2>{t.panelTitle}</h2><p>{t.panelCaption}</p></div><span className="panel-ready-dot" aria-hidden="true"/></div><div className="mf-tool-grid">{t.panelItems.map((item,i)=><article className={`mf-tool mf-tool-${i}`} key={item}><span className="mf-tool-icon" aria-hidden="true">{featureIcons[i]}</span><span>{item}</span><b aria-hidden="true">↗</b></article>)}</div><div className="mf-panel-footer"><span><i/> {t.panelStatus}</span><span>MF / PREMIERE PRO</span></div></div><div className="floating-tag tag-one">MF &nbsp; / &nbsp; PREMIERE PRO</div><div className="floating-tag tag-two">01 <span>YOUR CREATIVE FLOW</span></div></div></section>
    <div className="ticker"><span>MF PREMIERE PRO EXTENSION</span><b>✳</b><span>BUILT FOR THE EDIT</span><b>✳</b><span>YOUR TIMELINE, YOUR WAY</span><b>✳</b><span>MF PREMIERE PRO EXTENSION</span></div>
    <section className="feature-section section-wrap" id="features"><div className="section-intro"><span className="eyebrow">{t.sectionLabel} / 01</span><h2>{t.sectionTitle}</h2><p>{t.sectionText}</p></div><div className="feature-grid">{t.items.map((item,i)=><article className="feature-card" key={item} aria-label={`${item}. ${t.itemDescriptions[i]}`}><span className="feature-index">{new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { minimumIntegerDigits: 2, useGrouping: false }).format(i + 1)}</span><div className={`feature-icon icon-${i%6}`} aria-hidden="true">{featureIcons[i]}</div><h3>{item}</h3><p className="feature-description">{t.itemDescriptions[i]}</p><span className="arrow" aria-hidden="true">↗</span></article>)}</div><p className="disclosure">{t.disclosure}</p></section>
    <section className="pricing-section" id="pricing"><div className="section-wrap"><div className="section-intro"><span className="eyebrow">{t.priceKicker} / 02</span><h2>{t.priceTitle}</h2></div>{monthlyOffer&&lifetimeOffer?<div className="pricing-grid"><article className="price-card"><span className="eyebrow">01 / {t.monthly}</span><h3>{t.monthly}</h3><p>{t.monthlyDesc}</p><div className="price">{monthlyOffer.price.toLocaleString(lang==="ar"?"ar-EG":"en-EG")} <small>{catalog.currency}</small><span>{t.perMonth}</span></div><button className="button ghost wide" onClick={()=>choosePlanOnWhatsApp("monthly")}>{t.buy}<span>↗</span></button><div className="price-foot">{monthlyOffer.deviceLimit} DEVICE <i>•</i> {monthlyOffer.durationDays}-DAY ACCESS</div></article><article className="price-card featured"><span className="eyebrow">02 / {t.lifetime}</span><h3>{t.lifetime}</h3><p>{t.lifetimeDesc}</p><div className="price">{lifetimeOffer.price.toLocaleString(lang==="ar"?"ar-EG":"en-EG")} <small>{catalog.currency}</small><span>{t.oneTime}</span></div><button className="button primary wide" onClick={()=>choosePlanOnWhatsApp("lifetime")}>{t.buy}<span>↗</span></button><div className="price-foot">UP TO {lifetimeOffer.deviceLimit} DEVICES <i>•</i> ONE-TIME PURCHASE</div></article></div>:<p className="notice">{t.catalogUnavailable}</p>}{!catalogAvailable&&<p className="notice">{t.orderUnavailable}</p>}</div></section>
    <section className="how-section section-wrap" id="how"><div><span className="eyebrow">NO AUTOMATED PAYMENT CHECKS / 03</span><h2>{t.howTitle}</h2><div className="payment-box"><span>{t.paymentTitle}</span><strong>{catalog.paymentMethods.join(" · ")}</strong><b>{catalog.paymentNumber}</b><small>{t.paymentNote}</small></div></div><ol>{t.steps.map((step,i)=><li key={step}><span>0{i+1}</span>{step}</li>)}</ol></section>
    <section className="install-section section-wrap" id="installation"><div className="section-intro"><span className="eyebrow">INSTALL MF / 04</span><h2>{t.installTitle}</h2><p>{t.installIntro}</p></div><div className="install-content"><div className="requirements-card"><h3>{t.requirementsTitle}</h3><ul>{t.requirements.map((item)=><li key={item}>{item}</li>)}</ul></div><ol className="install-steps">{t.installSteps.map((step,i)=><li key={step}><span>0{i+1}</span><p>{step}</p></li>)}</ol></div></section>
    <section className="faq-section section-wrap"><div className="section-intro"><span className="eyebrow">ANSWERS / 05</span><h2>{t.faqTitle}</h2></div><div className="faq-list">{t.faqs.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    <style>{`.social-links{display:flex;align-items:center;flex-wrap:wrap;gap:14px}.social-links a{color:#ffbf48;font-size:12px;white-space:nowrap}.social-links a:hover{color:#ffd27a;text-decoration:underline}@media(max-width:520px){.social-links{gap:10px}.social-links a{font-size:11px}}`}</style>
    <footer className="footer"><a className="wordmark" href="#" aria-label="MF Premiere Pro"><span className="logo">MF</span></a><span>{t.footer}</span><nav className="social-links" aria-label={t.socialLinksLabel}><a href="https://www.instagram.com/mf.plaugin/" target="_blank" rel="noopener noreferrer">Instagram</a><a href="https://www.facebook.com/profile.php?id=61595866170318" target="_blank" rel="noopener noreferrer">Facebook</a><a href="https://www.tiktok.com/@mf.plugin" target="_blank" rel="noopener noreferrer">TikTok</a><a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" aria-label={`${t.whatsapp}: +20 10 1602 2870`}>{t.whatsapp}: +20 10 1602 2870</a></nav><a className="portfolio-link" href="https://mahmoudmostafa.online/" target="_blank" rel="noopener noreferrer">{t.portfolioLink}<span aria-hidden="true">↗</span></a><span>© MF / 2026 <button className="admin-dot" aria-label="Admin" title="Admin" onClick={()=>{setView("admin");setError("")}}>·</button></span></footer></>}
    {view==="order"&&<section className="flow-view"><button className="text-button" onClick={()=>setView("home")}>← {t.navFeatures}</button><div className="flow-card"><span className="eyebrow">PRIVATE ORDER / 01</span><h1>{t.orderTitle}</h1>{monthlyOffer&&lifetimeOffer?<><div className="pay-instructions"><strong>{localDemoEnabled ? t.localDemoPayment : catalogAvailable ? paymentDetails : t.catalogUnavailable}</strong><span>{localDemoEnabled ? t.localDemoNotice : catalogAvailable ? t.paymentNote : t.orderUnavailable}</span></div>{!catalogAvailable&&!localDemoEnabled&&<p className="notice">{t.orderUnavailable}</p>}<form onSubmit={createOrder}><label>{t.plan}<select value={plan} onChange={e=>setPlan(e.target.value as "monthly"|"lifetime")}><option value="monthly">{t.monthly} — {monthlyOffer.price.toLocaleString()} {catalog.currency}</option><option value="lifetime">{t.lifetime} — {lifetimeOffer.price.toLocaleString()} {catalog.currency}</option></select></label>{!localDemoEnabled&&<label>{t.contact}<input value={contact} onChange={e=>setContact(e.target.value)} placeholder={t.contactPlaceholder} required minLength={5}/></label>}<button className="button primary wide" disabled={!catalogAvailable&&!localDemoEnabled}>{localDemoEnabled ? t.createDemoOrder : t.submit}<span>↗</span></button>{!localDemoEnabled&&<><small>{t.pendingWarning}</small><small>{t.whatsappRedirectNotice}</small></>}</form></>:<p className="notice">{t.catalogUnavailable}</p>}</div></section>}
    {view==="status"&&<section className="flow-view"><button className="text-button" onClick={()=>setView("home")}>← MF</button><div className="flow-card"><span className="eyebrow">PRIVATE ORDER / STATUS</span><h1>{order?.demo ? t.demoCreatedTitle : t.orderCreated}</h1>{order&&<><p>{t.orderCode}: <code>{order.id}</code></p><p className="status-message">{order.demo ? t.demoOrderStatus : status==="approved"?t.approved:status==="rejected"?t.rejected:orderData?.reviewNote==="Payment not received yet"?t.paymentNotReceived:t.pending}</p>{order.demo&&<p className="notice">{t.demoReceiptNote}</p>}<form onSubmit={upload}><label>{t.receipt}<input name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required /></label><button className="button primary wide">{order.demo ? t.demoSubmitReceipt : t.submitReceipt}</button></form>{order.demo&&order.receiptSubmitted&&<p className="notice">{t.demoReceiptSelected}</p>}{!order.demo&&<><div className="divider"/><h3>{t.message}</h3><div className="chat-box">{(orderData?.messages||[]).map((m:any,i:number)=><p className={`chat-line ${m.sender}`} key={i}><b>{m.sender}:</b> {m.message}</p>)}</div><form className="chat-compose" onSubmit={sendCustomerMessage}><input value={messageText} onChange={e=>setMessageText(e.target.value)} maxLength={1000} placeholder={t.message}/><button className="button ghost">{t.send}</button></form><div className="divider"/><button className="button ghost wide" onClick={async()=>{try{const value=await api.claim(order.id,order.token);setSecret(JSON.stringify(value.fulfillment,null,2));}catch(e){setErrorSafe(e)}}}>{t.claimAccess}</button><p>{t.accessToken} <code className="token">{order.token}</code></p></>}</>}{error&&<p className="error-banner">{error}</p>}</div></section>}
    {secret&&<div className="modal-backdrop"><div className="secret-modal"><button className="modal-close" onClick={()=>setSecret("")}>×</button><span className="eyebrow">ONE-TIME ACCESS</span><h2>{t.approved}</h2><pre>{secret}</pre><button className="button primary wide" onClick={()=>setSecret("")}>OK</button></div></div>}
    {view === "home" && <div className="support-tools" dir={lang === "ar" ? "rtl" : "ltr"}>
      <a className="support-whatsapp" href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lang === "ar" ? "مرحبًا، لدي سؤال عن إضافة MF لـ Premiere Pro." : "Hello, I have a question about the MF Premiere Pro extension.")}`} target="_blank" rel="noopener noreferrer" aria-label={lang === "ar" ? "تواصل معنا على واتساب" : "Contact us on WhatsApp"} title={lang === "ar" ? "واتساب" : "WhatsApp"}>
        <svg className="support-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3 20l.9-4.7a8.5 8.5 0 1 1 16.6-3.6Z"/><path d="M8.4 8.1c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.8 1.8c.1.2.1.4-.1.6l-.6.7c-.2.2-.2.4-.1.6.6 1 1.4 1.8 2.4 2.4.2.1.4.1.6-.1l.8-.9c.2-.2.4-.2.6-.1l1.7.8c.3.1.4.3.4.5 0 .3-.1 1.1-.7 1.6-.5.5-1.2.7-1.9.6-1.1-.1-2.6-.8-4.1-2.1-1.4-1.2-2.3-2.8-2.6-3.9-.3-1 .1-1.9.6-2.4Z"/></svg>
      </a>
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
