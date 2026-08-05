const LANGUAGE_STORAGE_KEY = "physiovision.language.v1";

export const SUPPORTED_LANGUAGES = Object.freeze([
  Object.freeze({ code: "en-SG", label: "English", speech: "en-SG" }),
  Object.freeze({ code: "zh-SG", label: "华语", speech: "zh-CN" }),
  Object.freeze({ code: "ms-SG", label: "Bahasa Melayu", speech: "ms-MY" }),
  Object.freeze({ code: "ta-SG", label: "தமிழ்", speech: "ta-IN" }),
]);

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map(({ code }) => code));

// Safety-critical wording is deliberately bundled and deterministic. Gemini
// may classify an otherwise-unmatched answer, but it never writes these
// questions or recommendations.
const TRANSLATION_ROWS = [
  ["Language", "语言", "Bahasa", "மொழி"],
  ["Choose language", "选择语言", "Pilih bahasa", "மொழியைத் தேர்ந்தெடுக்கவும்"],
  ["Text size", "文字大小", "Saiz teks", "உரை அளவு"],
  ["Choose text size", "选择文字大小", "Pilih saiz teks", "உரை அளவைத் தேர்ந்தெடுக்கவும்"],
  ["Standard", "标准", "Standard", "வழக்கமானது"],
  ["Large", "大", "Besar", "பெரியது"],
  ["Extra large", "特大", "Sangat besar", "மிகப் பெரியது"],
  ["Skip to main content", "跳到主要内容", "Langkau ke kandungan utama", "முதன்மை உள்ளடக்கத்திற்குச் செல்லவும்"],
  ["Main navigation", "主导航", "Navigasi utama", "முதன்மை வழிசெலுத்தல்"],
  ["Mobile navigation", "移动导航", "Navigasi mudah alih", "கைப்பேசி வழிசெலுத்தல்"],
  ["Open navigation", "打开导航", "Buka navigasi", "வழிசெலுத்தலைத் திறக்கவும்"],
  ["How it works", "使用方式", "Cara ia berfungsi", "இது எவ்வாறு செயல்படுகிறது"],
  ["Exercise guide", "运动指导", "Panduan senaman", "உடற்பயிற்சி வழிகாட்டி"],
  ["Library", "资料库", "Perpustakaan", "நூலகம்"],
  ["For care teams", "护理团队", "Untuk pasukan penjagaan", "பராமரிப்புக் குழுக்களுக்கு"],
  ["Safety", "安全", "Keselamatan", "பாதுகாப்பு"],
  ["Sign in / Register", "登录 / 注册", "Log masuk / Daftar", "உள்நுழையவும் / பதிவு செய்யவும்"],
  ["Sign in", "登录", "Log masuk", "உள்நுழையவும்"],
  ["Create account", "创建账户", "Cipta akaun", "கணக்கை உருவாக்கவும்"],
  ["Sign in or create account", "登录或创建账户", "Log masuk atau cipta akaun", "உள்நுழையவும் அல்லது கணக்கை உருவாக்கவும்"],
  ["Sign in securely", "安全登录", "Log masuk dengan selamat", "பாதுகாப்பாக உள்நுழையவும்"],
  ["Sign in to start", "登录后开始", "Log masuk untuk mula", "தொடங்க உள்நுழையவும்"],
  ["My home", "我的主页", "Halaman saya", "எனது முகப்பு"],
  ["My profile", "我的资料", "Profil saya", "எனது சுயவிவரம்"],
  ["Therapist view", "物理治疗师页面", "Paparan ahli fisioterapi", "உடற்பயிற்சி சிகிச்சையாளர் பார்வை"],
  ["Sign out", "退出登录", "Log keluar", "வெளியேறவும்"],
  ["Create my plan", "制定我的计划", "Cipta pelan saya", "எனது திட்டத்தை உருவாக்கவும்"],
  ["Your PhysioVision home", "您的PhysioVision主页", "Halaman PhysioVision anda", "உங்கள் PhysioVision முகப்பு"],
  ["Welcome back,", "欢迎回来，", "Selamat kembali,", "மீண்டும் வரவேற்கிறோம்,"],
  ["there", "您好", "anda", "நண்பரே"],
  ["Your plan, progress and support are together in one clear place.", "您的计划、进度和支持都集中在一个清晰的页面。", "Pelan, kemajuan dan sokongan anda berada di satu tempat yang jelas.", "உங்கள் திட்டம், முன்னேற்றம் மற்றும் ஆதரவு அனைத்தும் ஒரே தெளிவான இடத்தில் உள்ளன."],
  ["Start today’s exercises", "开始今天的运动", "Mulakan senaman hari ini", "இன்றைய உடற்பயிற்சிகளைத் தொடங்கவும்"],
  ["My exercise plan", "我的运动计划", "Pelan senaman saya", "எனது உடற்பயிற்சி திட்டம்"],
  ["Today’s programme", "今天的计划", "Program hari ini", "இன்றைய திட்டம்"],
  ["Loading plan…", "正在加载计划……", "Memuatkan pelan…", "திட்டம் ஏற்றப்படுகிறது…"],
  ["Start exercises", "开始运动", "Mulakan senaman", "உடற்பயிற்சிகளைத் தொடங்கவும்"],
  ["Start wellness exercises", "开始健康运动", "Mulakan senaman kesejahteraan", "நலவாழ்வு உடற்பயிற்சிகளைத் தொடங்கவும்"],
  ["Change my plan", "更改我的计划", "Tukar pelan saya", "எனது திட்டத்தை மாற்றவும்"],
  ["AI plan accepted", "AI计划已接受", "Pelan AI diterima", "AI திட்டம் ஏற்கப்பட்டது"],
  ["Want a physiotherapist to guide you?", "希望物理治疗师指导您吗？", "Mahu ahli fisioterapi membimbing anda?", "உடற்பயிற்சி சிகிச்சையாளர் உங்களை வழிநடத்த வேண்டுமா?"],
  ["Request a physiotherapist", "请求物理治疗师", "Minta ahli fisioterapi", "உடற்பயிற்சி சிகிச்சையாளரைக் கோரவும்"],
  ["My progress", "我的进度", "Kemajuan saya", "எனது முன்னேற்றம்"],
  ["Recent movement trend", "近期动作趋势", "Trend pergerakan terkini", "சமீபத்திய இயக்கப் போக்கு"],
  ["Building baseline", "正在建立基准", "Membina garis asas", "அடிப்படை அளவு உருவாக்கப்படுகிறது"],
  ["Sessions this week", "本周训练次数", "Sesi minggu ini", "இந்த வார அமர்வுகள்"],
  ["completed sessions", "已完成训练", "sesi selesai", "முடிக்கப்பட்ட அமர்வுகள்"],
  ["Movement quality", "动作质量", "Kualiti pergerakan", "இயக்கத் தரம்"],
  ["recent measured average", "近期测量平均值", "purata ukuran terkini", "சமீபத்திய அளவீட்டு சராசரி"],
  ["Latest pain check-in", "最新疼痛检查", "Pemeriksaan kesakitan terkini", "சமீபத்திய வலி சோதனை"],
  ["self-reported, out of 10", "自我报告，满分10分", "dilaporkan sendiri, daripada 10", "சுயமாகத் தெரிவித்தது, 10-இல்"],
  ["No measured quality scores yet.", "还没有动作质量评分。", "Belum ada skor kualiti yang diukur.", "இன்னும் அளவிடப்பட்ட தர மதிப்பெண்கள் இல்லை."],
  ["Back to my home", "返回我的主页", "Kembali ke halaman saya", "எனது முகப்பிற்குத் திரும்பவும்"],
  ["Live exercise guide", "实时运动指导", "Panduan senaman langsung", "நேரடி உடற்பயிற்சி வழிகாட்டி"],
  ["Today’s session · about 12 minutes", "今天的训练 · 约12分钟", "Sesi hari ini · kira-kira 12 minit", "இன்றைய பயிற்சி · சுமார் 12 நிமிடங்கள்"],
  ["Your movement.", "您的动作。", "Pergerakan anda.", "உங்கள் இயக்கம்."],
  ["Clearly guided.", "清楚指导。", "Dibimbing dengan jelas.", "தெளிவான வழிகாட்டுதல்."],
  ["Ready when you are", "准备好就开始", "Mulakan apabila anda bersedia", "நீங்கள் தயாரானதும் தொடங்கலாம்"],
  ["Clear 2–3 metres of space", "腾出2至3米的空间", "Kosongkan ruang 2–3 meter", "2–3 மீட்டர் இடத்தை காலியாக வைக்கவும்"],
  ["Stand where your full body fits", "站在全身都能入镜的位置", "Berdiri supaya seluruh badan kelihatan", "உங்கள் முழு உடலும் தெரியுமாறு நிற்கவும்"],
  ["Press Start camera guide below. We’ll ask about your pain level before turning on the camera.", "按下方的“开始摄像头指导”。打开摄像头前，我们会询问您的疼痛程度。", "Tekan Mulakan panduan kamera di bawah. Kami akan bertanya tahap kesakitan anda sebelum menghidupkan kamera.", "கீழே உள்ள கேமரா வழிகாட்டியைத் தொடங்கவும் என்பதை அழுத்தவும். கேமராவை இயக்கும் முன் உங்கள் வலி அளவைக் கேட்போம்."],
  ["Start camera guide", "开始摄像头指导", "Mulakan panduan kamera", "கேமரா வழிகாட்டியைத் தொடங்கவும்"],
  ["Resume camera guide", "继续摄像头指导", "Sambung panduan kamera", "கேமரா வழிகாட்டியைத் தொடரவும்"],
  ["Face your device and keep a stable chair nearby for support.", "面向设备，并在旁边放一张稳固的椅子作为支撑。", "Hadap peranti anda dan letakkan kerusi yang kukuh berdekatan sebagai sokongan.", "உங்கள் சாதனத்தை நோக்கி நிற்கவும்; ஆதரவுக்காக அருகில் உறுதியான நாற்காலியை வைக்கவும்."],
  ["Preparing movement guide…", "正在准备运动指导……", "Sedang menyediakan panduan pergerakan…", "இயக்க வழிகாட்டி தயாராகிறது…"],
  ["Movement guide ready", "运动指导已准备好", "Panduan pergerakan sedia", "இயக்க வழிகாட்டி தயாராக உள்ளது"],
  ["Voice on", "语音已开启", "Suara dihidupkan", "குரல் இயக்கத்தில் உள்ளது"],
  ["Voice off", "语音已关闭", "Suara dimatikan", "குரல் முடக்கப்பட்டுள்ளது"],
  ["Before movement begins", "动作开始前", "Sebelum pergerakan bermula", "இயக்கம் தொடங்குவதற்கு முன்"],
  ["How would you like to answer?", "您想如何回答？", "Bagaimanakah anda mahu menjawab?", "நீங்கள் எவ்வாறு பதிலளிக்க விரும்புகிறீர்கள்?"],
  ["Choose now, while you are still near your device. No AI guidance will speak until you make this choice.", "请趁您仍靠近设备时选择。在您作出选择前，AI指导不会说话。", "Pilih sekarang semasa anda masih berhampiran peranti. Panduan AI tidak akan bercakap sehingga anda membuat pilihan.", "உங்கள் சாதனத்திற்கு அருகில் இருக்கும்போதே இப்போது தேர்ந்தெடுக்கவும். நீங்கள் தேர்வு செய்யும் வரை AI வழிகாட்டுதல் பேசாது."],
  ["Use hands-free voice", "使用免手持语音", "Gunakan suara bebas tangan", "கைகளைப் பயன்படுத்தாத குரல் முறையைப் பயன்படுத்தவும்"],
  ["Hear each question, then answer aloud automatically without returning to press a button.", "听完每个问题后直接说出答案，无需回来按按钮。", "Dengar setiap soalan, kemudian jawab dengan suara tanpa perlu kembali menekan butang.", "ஒவ்வொரு கேள்வியையும் கேட்டபின், மீண்டும் பொத்தானை அழுத்தாமல் உரக்கப் பதிலளிக்கவும்."],
  ["Use on-screen buttons", "使用屏幕按钮", "Gunakan butang pada skrin", "திரைப் பொத்தான்களைப் பயன்படுத்தவும்"],
  ["Keep spoken guidance and microphone listening off.", "关闭语音指导和麦克风监听。", "Matikan panduan suara dan pendengaran mikrofon.", "பேச்சு வழிகாட்டுதலையும் ஒலிவாங்கி கேட்பதையும் அணைக்கவும்."],
  ["Checking microphone permission…", "正在检查麦克风权限……", "Memeriksa kebenaran mikrofon…", "ஒலிவாங்கி அனுமதி சரிபார்க்கப்படுகிறது…"],
  ["Preparing consistent voice guidance…", "正在准备稳定的语音指导……", "Menyediakan panduan suara yang konsisten…", "சீரான குரல் வழிகாட்டுதல் தயாராகிறது…"],
  ["Try microphone again", "再次尝试麦克风", "Cuba mikrofon sekali lagi", "ஒலிவாங்கியை மீண்டும் முயற்சிக்கவும்"],
  ["or choose on-screen buttons", "或选择屏幕按钮", "atau pilih butang pada skrin", "அல்லது திரைப் பொத்தான்களைத் தேர்ந்தெடுக்கவும்"],
  ["Safari did not show a permission prompt because microphone access is blocked. Open Safari > Settings > Websites > Microphone, set this website to Allow, then select Try microphone again. If needed, also turn on Safari in System Settings > Privacy & Security > Microphone.", "由于麦克风访问已被阻止，Safari没有显示权限提示。打开Safari > 设置 > 网站 > 麦克风，将此网站设为允许，然后选择“再次尝试麦克风”。如有需要，也请在系统设置 > 隐私与安全性 > 麦克风中开启Safari。", "Safari tidak menunjukkan permintaan kebenaran kerana akses mikrofon disekat. Buka Safari > Settings > Websites > Microphone, tetapkan laman ini kepada Allow, kemudian pilih Cuba mikrofon sekali lagi. Jika perlu, hidupkan Safari juga dalam System Settings > Privacy & Security > Microphone.", "ஒலிவாங்கி அணுகல் தடுக்கப்பட்டுள்ளதால் Safari அனுமதி அறிவிப்பைக் காட்டவில்லை. Safari > Settings > Websites > Microphone என்பதைத் திறந்து, இந்த இணையதளத்திற்கு Allow என்பதைத் தேர்ந்தெடுத்து, பின்னர் ஒலிவாங்கியை மீண்டும் முயற்சிக்கவும் என்பதைத் தேர்ந்தெடுக்கவும். தேவைப்பட்டால் System Settings > Privacy & Security > Microphone என்பதில் Safari-ஐ இயக்கவும்."],
  ["Microphone access is blocked for this website. Allow microphone access in your browser settings, then select Try microphone again.", "此网站的麦克风访问已被阻止。请在浏览器设置中允许麦克风访问，然后选择“再次尝试麦克风”。", "Akses mikrofon disekat untuk laman ini. Benarkan akses mikrofon dalam tetapan pelayar, kemudian pilih Cuba mikrofon sekali lagi.", "இந்த இணையதளத்திற்கான ஒலிவாங்கி அணுகல் தடுக்கப்பட்டுள்ளது. உலாவி அமைப்புகளில் அணுகலை அனுமதித்து, பின்னர் ஒலிவாங்கியை மீண்டும் முயற்சிக்கவும் என்பதைத் தேர்ந்தெடுக்கவும்."],
  ["No microphone was found. Connect or enable a microphone, then select Try microphone again.", "未找到麦克风。请连接或启用麦克风，然后选择“再次尝试麦克风”。", "Tiada mikrofon ditemui. Sambungkan atau hidupkan mikrofon, kemudian pilih Cuba mikrofon sekali lagi.", "ஒலிவாங்கி எதுவும் காணப்படவில்லை. ஒலிவாங்கியை இணைக்கவும் அல்லது இயக்கவும்; பின்னர் மீண்டும் முயற்சிக்கவும்."],
  ["The microphone is unavailable or being used by another application. Close the other application, then select Try microphone again.", "麦克风不可用或正被其他应用程序使用。关闭其他应用程序，然后选择“再次尝试麦克风”。", "Mikrofon tidak tersedia atau sedang digunakan oleh aplikasi lain. Tutup aplikasi tersebut, kemudian pilih Cuba mikrofon sekali lagi.", "ஒலிவாங்கி கிடைக்கவில்லை அல்லது வேறொரு செயலியால் பயன்படுத்தப்படுகிறது. அந்தச் செயலியை மூடி, பின்னர் மீண்டும் முயற்சிக்கவும்."],
  ["The microphone could not start. Check your browser and system microphone settings, then select Try microphone again.", "麦克风无法启动。请检查浏览器和系统麦克风设置，然后选择“再次尝试麦克风”。", "Mikrofon tidak dapat dimulakan. Semak tetapan mikrofon pelayar dan sistem, kemudian pilih Cuba mikrofon sekali lagi.", "ஒலிவாங்கியைத் தொடங்க முடியவில்லை. உலாவி மற்றும் கணினி ஒலிவாங்கி அமைப்புகளைச் சரிபார்த்து, பின்னர் மீண்டும் முயற்சிக்கவும்."],
  ["Phone at chest height · 2–3 m away · Full body visible", "手机置于胸口高度 · 距离2至3米 · 全身可见", "Telefon setinggi dada · Jarak 2–3 m · Seluruh badan kelihatan", "தொலைபேசி மார்பு உயரத்தில் · 2–3 மீ தூரத்தில் · முழு உடலும் தெரிய வேண்டும்"],
  ["Exercise", "运动", "Senaman", "உடற்பயிற்சி"],
  ["Today", "今天", "Hari ini", "இன்று"],
  ["Personalized AI", "个性化AI", "AI diperibadikan", "தனிப்பயன் AI"],
  ["Standard range", "标准幅度", "Julat standard", "வழக்கமான இயக்க வரம்பு"],
  ["Calibrate", "校准", "Tentukur", "அளவீடு செய்யவும்"],
  ["Choose exercise", "选择运动", "Pilih senaman", "உடற்பயிற்சியைத் தேர்ந்தெடுக்கவும்"],
  ["Focus side", "重点侧", "Bahagian fokus", "கவனிக்க வேண்டிய பக்கம்"],
  ["Plan", "计划", "Pelan", "திட்டம்"],
  ["Right side", "右侧", "Sebelah kanan", "வலது பக்கம்"],
  ["Left side", "左侧", "Sebelah kiri", "இடது பக்கம்"],
  ["Both sides", "两侧", "Kedua-dua belah", "இரு பக்கங்களும்"],
  ["reps", "次", "ulangan", "முறைகள்"],
  ["Goal", "目标", "Sasaran", "இலக்கு"],
  ["Set complete", "一组已完成", "Set selesai", "சுற்று முடிந்தது"],
  ["Get into position", "请就位", "Ambil kedudukan", "நிலைக்கு வரவும்"],
  ["Live guidance appears here", "实时指导会显示在这里", "Panduan langsung dipaparkan di sini", "நேரடி வழிகாட்டுதல் இங்கே தோன்றும்"],
  ["Position yourself to start", "请就位以开始", "Ambil kedudukan untuk mula", "தொடங்குவதற்கான நிலைக்கு வரவும்"],
  ["Hold this position steadily", "稳定保持这个姿势", "Kekalkan posisi ini dengan stabil", "இந்த நிலையை உறுதியாகப் பிடித்திருக்கவும்"],
  ["Small adjustment", "稍作调整", "Pelarasan kecil", "சிறிய திருத்தம்"],
  ["Follow the coaching cue below", "请按照下方的指导提示", "Ikut arahan bimbingan di bawah", "கீழே உள்ள வழிகாட்டுதலைப் பின்பற்றவும்"],
  ["Movement looks good", "动作良好", "Pergerakan kelihatan baik", "இயக்கம் நன்றாக உள்ளது"],
  ["Keep this pace and breathe naturally", "保持这个速度并自然呼吸", "Kekalkan rentak ini dan bernafas seperti biasa", "இந்த வேகத்தைத் தொடர்ந்து இயல்பாக சுவாசிக்கவும்"],
  ["Tracking uncertain", "追踪不确定", "Penjejakan tidak pasti", "கண்காணிப்பு தெளிவாக இல்லை"],
  ["Make sure your required joints are clearly visible", "确保所需关节清晰可见", "Pastikan sendi yang diperlukan kelihatan jelas", "தேவையான மூட்டுகள் தெளிவாகத் தெரிவதை உறுதிசெய்யவும்"],
  ["Let’s get you in frame", "让您完整入镜", "Mari pastikan anda berada dalam bingkai", "உங்களை கேமரா சட்டகத்திற்குள் கொண்டுவருவோம்"],
  ["Make sure your full body is visible", "确保全身可见", "Pastikan seluruh badan anda kelihatan", "உங்கள் முழு உடலும் தெரிவதை உறுதிசெய்யவும்"],
  ["Hand tracking ready", "手部追踪已准备好", "Penjejakan tangan sedia", "கை கண்காணிப்பு தயாராக உள்ளது"],
  ["Exercise finished by you", "您已结束运动", "Senaman ditamatkan oleh anda", "உடற்பயிற்சியை நீங்கள் முடித்துள்ளீர்கள்"],
  ["standing", "站立", "berdiri", "நிற்றல்"],
  ["squat", "下蹲", "mencangkung", "குந்துதல்"],
  ["flat", "放平", "rata", "தட்டையாக"],
  ["raised", "抬起", "diangkat", "உயர்த்தப்பட்டது"],
  ["rest", "休息位", "rehat", "ஓய்வு"],
  ["stretch", "伸展", "regangan", "நீட்டல்"],
  ["Half Squats", "半蹲", "Cangkung separuh", "அரை குந்துதல்"],
  ["Calf Raises", "提踵", "Angkat tumit", "குதிகால் உயர்த்துதல்"],
  ["Hip Abduction", "髋外展", "Abduksi pinggul", "இடுப்பு வெளிப்புற நகர்வு"],
  ["Heel Cord Stretch", "跟腱伸展", "Regangan tendon tumit", "குதிகால் தசைநார் நீட்டல்"],
  ["Standing Quadriceps Stretch", "站立股四头肌伸展", "Regangan kuadrisep berdiri", "நின்றபடி தொடைத் தசை நீட்டல்"],
  ["Supine Hamstring Stretch", "仰卧腿后肌伸展", "Regangan hamstring terlentang", "மல்லாந்த நிலையில் பின்தொடை நீட்டல்"],
  ["Hamstring Curls", "腿后肌弯举", "Keriting hamstring", "பின்தொடை மடக்குதல்"],
  ["Leg Extensions (Seated)", "坐姿伸腿", "Luruskan kaki (duduk)", "அமர்ந்தபடி கால் நீட்டுதல்"],
  ["Straight-Leg Raises (Supine)", "仰卧直腿抬高", "Angkat kaki lurus (terlentang)", "மல்லாந்த நிலையில் நேராக கால் உயர்த்துதல்"],
  ["Straight-Leg Raises (Prone)", "俯卧直腿抬高", "Angkat kaki lurus (meniarap)", "குப்புற நிலையில் நேராக கால் உயர்த்துதல்"],
  ["Hip Adduction", "髋内收", "Adduksi pinggul", "இடுப்பு உட்புற நகர்வு"],
  ["Leg Presses (Elastic Band)", "弹力带腿推", "Tekan kaki (jalur elastik)", "எலாஸ்டிக் பட்டையுடன் கால் அழுத்துதல்"],
  ["Ankle Pumps", "脚踝泵动", "Pam buku lali", "கணுக்கால் அசைவு"],
  ["Heel Slides", "脚跟滑动", "Gelongsor tumit", "குதிகால் சறுக்குதல்"],
  ["Hip Bridge", "臀桥", "Jambatan pinggul", "இடுப்பு பாலம்"],
  ["Supported Single-Leg Balance", "扶持单脚平衡", "Imbangan satu kaki dengan sokongan", "ஆதரவுடன் ஒற்றைக் கால் சமநிலை"],
  ["Clamshell", "蚌式开合", "Senaman kerang", "கிளாம்ஷெல்"],
  ["Supported Forward Step-Up", "扶持向前踏阶", "Naik langkah ke hadapan dengan sokongan", "ஆதரவுடன் முன்னோக்கி படி ஏறுதல்"],
  ["Move your left knee back so it stays over your foot", "将左膝稍微后移，使其保持在脚的上方", "Gerakkan lutut kiri ke belakang supaya kekal di atas kaki", "இடது முழங்காலைப் பின்னால் நகர்த்தி பாதத்தின் மேல் வைத்திருக்கவும்"],
  ["Move your right knee back so it stays over your foot", "将右膝稍微后移，使其保持在脚的上方", "Gerakkan lutut kanan ke belakang supaya kekal di atas kaki", "வலது முழங்காலைப் பின்னால் நகர்த்தி பாதத்தின் மேல் வைத்திருக்கவும்"],
  ["Keep both knees bending equally", "保持双膝弯曲幅度一致", "Pastikan kedua-dua lutut membengkok sama rata", "இரு முழங்கால்களையும் சமமாக மடக்கவும்"],
  ["Lift your chest slightly — avoid leaning too far forward", "稍微抬起胸口，避免过度前倾", "Angkat dada sedikit dan elakkan membongkok terlalu jauh ke hadapan", "மார்பைச் சற்று உயர்த்தி, அதிகமாக முன்னால் சாய்வதைத் தவிர்க்கவும்"],
  ["Don't go too deep — this is a half squat only", "不要蹲得太低，这只是半蹲", "Jangan turun terlalu rendah — ini hanya cangkung separuh", "மிகவும் கீழே செல்ல வேண்டாம் — இது அரை குந்துதல் மட்டுமே"],
  ["Rise higher onto your toes", "脚尖再踮高一些", "Naik lebih tinggi pada hujung jari kaki", "கால் விரல்களின் மீது மேலும் உயரவும்"],
  ["Lift the leg higher — aim for a 45° angle from your body", "将腿抬高，目标是与身体形成45度角", "Angkat kaki lebih tinggi — sasarkan sudut 45° dari badan", "காலை மேலும் உயர்த்தி உடலிலிருந்து 45° கோணத்தை நோக்கவும்"],
  ["Before exercise", "运动前", "Sebelum senaman", "உடற்பயிற்சிக்கு முன்"],
  ["After exercise", "运动后", "Selepas senaman", "உடற்பயிற்சிக்குப் பிறகு"],
  ["Before exercise pain", "运动前疼痛", "Kesakitan sebelum senaman", "உடற்பயிற்சிக்கு முந்தைய வலி"],
  ["Pain level recorded", "疼痛程度已记录", "Tahap kesakitan direkodkan", "வலி அளவு பதிவு செய்யப்பட்டது"],
  ["What is your pain level right now?", "您现在的疼痛程度是多少？", "Apakah tahap kesakitan anda sekarang?", "இப்போது உங்கள் வலி அளவு என்ன?"],
  ["Before we begin, how is your pain right now? Please give me a number from zero to ten.", "开始前，请问您现在的疼痛程度如何？请说一个从0到10的数字。", "Sebelum kita mula, bagaimana tahap kesakitan anda sekarang? Sila berikan nombor daripada kosong hingga sepuluh.", "தொடங்குவதற்கு முன், இப்போது உங்கள் வலி எப்படி உள்ளது? பூஜ்ஜியத்திலிருந்து பத்து வரை ஒரு எண்ணைக் கூறவும்."],
  ["You’ve finished the exercise. How is your pain now? Please give me a number from zero to ten.", "您已完成运动。现在的疼痛程度如何？请说一个从0到10的数字。", "Anda telah selesai bersenam. Bagaimana tahap kesakitan anda sekarang? Sila berikan nombor daripada kosong hingga sepuluh.", "உடற்பயிற்சியை முடித்துவிட்டீர்கள். இப்போது உங்கள் வலி எப்படி உள்ளது? பூஜ்ஜியத்திலிருந்து பத்து வரை ஒரு எண்ணைக் கூறவும்."],
  ["(0 = none, 10 = severe)", "（0 = 无疼痛，10 = 剧烈疼痛）", "(0 = tiada, 10 = teruk)", "(0 = வலி இல்லை, 10 = கடுமையான வலி)"],
  ["Please confirm your pain level", "请确认您的疼痛程度", "Sila sahkan tahap kesakitan anda", "உங்கள் வலி அளவை உறுதிப்படுத்தவும்"],
  ["Yes, that’s correct", "是的，正确", "Ya, betul", "ஆம், அது சரி"],
  ["Change my answer", "更改答案", "Tukar jawapan saya", "எனது பதிலை மாற்றவும்"],
  ["Compared with your previous session, how is your recovery?", "与上次训练相比，您的恢复情况如何？", "Berbanding sesi sebelumnya, bagaimana pemulihan anda?", "முந்தைய பயிற்சியுடன் ஒப்பிடும்போது, உங்கள் மீட்பு எப்படி உள்ளது?"],
  ["Compared with your previous session, is your recovery better, about the same, worse, or are you not sure?", "与上次训练相比，您的恢复情况是好转、差不多、更糟，还是不确定？", "Berbanding sesi sebelumnya, adakah pemulihan anda lebih baik, lebih kurang sama, lebih teruk, atau anda tidak pasti?", "முந்தைய பயிற்சியுடன் ஒப்பிடும்போது, உங்கள் மீட்பு மேம்பட்டுள்ளதா, ஏறக்குறைய அதேபோல் உள்ளதா, மோசமாக உள்ளதா, அல்லது உறுதியாகத் தெரியவில்லையா?"],
  ["Compared with before this exercise, do you feel better, about the same, worse, or are you not sure?", "与运动前相比，您感觉好转、差不多、更糟，还是不确定？", "Berbanding sebelum senaman ini, adakah anda berasa lebih baik, lebih kurang sama, lebih teruk, atau tidak pasti?", "இந்த உடற்பயிற்சிக்கு முன்புடன் ஒப்பிடும்போது, மேம்பட்டுள்ளதா, ஏறக்குறைய அதேபோல் உள்ளதா, மோசமாக உள்ளதா, அல்லது உறுதியாகத் தெரியவில்லையா?"],
  ["Better", "好转", "Lebih baik", "மேம்பட்டுள்ளது"],
  ["About the same", "差不多", "Lebih kurang sama", "ஏறக்குறைய அதே"],
  ["Worse", "更糟", "Lebih teruk", "மோசமாக உள்ளது"],
  ["Not sure", "不确定", "Tidak pasti", "உறுதியாகத் தெரியவில்லை"],
  ["Let’s make sure you are safe", "让我们确认您的安全", "Mari pastikan anda selamat", "நீங்கள் பாதுகாப்பாக இருப்பதை உறுதிசெய்வோம்"],
  ["Let’s check that you are safe", "让我们检查您是否安全", "Mari periksa bahawa anda selamat", "நீங்கள் பாதுகாப்பாக இருப்பதைச் சரிபார்ப்போம்"],
  ["Please stay resting", "请继续休息", "Sila terus berehat", "தொடர்ந்து ஓய்வெடுக்கவும்"],
  ["Answer by voice", "用语音回答", "Jawab dengan suara", "குரல் மூலம் பதிலளிக்கவும்"],
  ["Skip check-in", "跳过检查", "Langkau pemeriksaan", "சோதனையைத் தவிர்க்கவும்"],
  ["Thank you. I will ask a few short questions to help check whether it is safe for you to proceed. Please stop moving and rest somewhere safe.", "谢谢。我会问几个简短的问题，以确认您是否适合继续。请停止动作，并在安全的地方休息。", "Terima kasih. Saya akan bertanya beberapa soalan ringkas untuk membantu memeriksa sama ada selamat untuk anda meneruskan. Sila berhenti bergerak dan berehat di tempat yang selamat.", "நன்றி. நீங்கள் தொடர்வது பாதுகாப்பானதா என்பதைச் சரிபார்க்க சில குறுகிய கேள்விகளைக் கேட்பேன். அசைவதை நிறுத்தி பாதுகாப்பான இடத்தில் ஓய்வெடுக்கவும்."],
  ["Are you experiencing chest pressure, unusual shortness of breath, dizziness, faintness, sudden weakness or numbness, or have you fallen?", "您是否有胸口受压、异常呼吸急促、头晕、晕眩、突然无力或麻木，或者曾经跌倒？", "Adakah anda mengalami tekanan dada, sesak nafas yang luar biasa, pening, rasa hendak pitam, kelemahan atau kebas secara tiba-tiba, atau adakah anda telah terjatuh?", "உங்களுக்கு மார்பில் அழுத்தம், வழக்கத்திற்கு மாறான மூச்சுத்திணறல், தலைச்சுற்றல், மயக்கம், திடீர் பலவீனம் அல்லது உணர்வின்மை உள்ளதா, அல்லது நீங்கள் விழுந்துவிட்டீர்களா?"],
  ["Do you have any of those warning signs? Say yes, no, or not sure.", "您有以上任何警示症状吗？请说“是”、“否”或“不确定”。", "Adakah anda mengalami mana-mana tanda amaran itu? Sebut ya, tidak atau tidak pasti.", "அந்த எச்சரிக்கை அறிகுறிகளில் ஏதேனும் உள்ளதா? ஆம், இல்லை அல்லது உறுதியாகத் தெரியவில்லை என்று கூறவும்."],
  ["Do you have chest pressure or chest pain now? Say yes, no, or not sure.", "您现在有胸口受压或胸痛吗？请说“是”、“否”或“不确定”。", "Adakah anda mengalami tekanan atau sakit dada sekarang? Sebut ya, tidak atau tidak pasti.", "இப்போது மார்பில் அழுத்தம் அல்லது மார்பு வலி உள்ளதா? ஆம், இல்லை அல்லது உறுதியாகத் தெரியவில்லை என்று கூறவும்."],
  ["Is it unusually difficult to breathe now? Say yes, no, or not sure.", "您现在是否异常呼吸困难？请说“是”、“否”或“不确定”。", "Adakah anda mengalami kesukaran bernafas yang luar biasa sekarang? Sebut ya, tidak atau tidak pasti.", "இப்போது வழக்கத்திற்கு மாறாக சுவாசிக்க சிரமமாக உள்ளதா? ஆம், இல்லை அல்லது உறுதியாகத் தெரியவில்லை என்று கூறவும்."],
  ["Are you dizzy, faint, suddenly weak, or numb? Say yes, no, or not sure.", "您是否头晕、晕眩、突然无力或麻木？请说“是”、“否”或“不确定”。", "Adakah anda pening, hendak pitam, lemah secara tiba-tiba atau kebas? Sebut ya, tidak atau tidak pasti.", "தலைச்சுற்றல், மயக்கம், திடீர் பலவீனம் அல்லது உணர்வின்மை உள்ளதா? ஆம், இல்லை அல்லது உறுதியாகத் தெரியவில்லை என்று கூறவும்."],
  ["Where does it hurt: knee, hip, ankle, back, shoulder, or somewhere else?", "哪里疼痛：膝盖、髋部、脚踝、背部、肩膀，还是其他部位？", "Di manakah sakitnya: lutut, pinggul, buku lali, belakang, bahu atau tempat lain?", "எங்கே வலிக்கிறது: முழங்கால், இடுப்பு, கணுக்கால், முதுகு, தோள் அல்லது வேறு இடமா?"],
  ["Is the pain on the left, right, both sides, or are you not sure?", "疼痛在左侧、右侧、两侧，还是您不确定？", "Adakah sakit di sebelah kiri, kanan, kedua-dua belah atau anda tidak pasti?", "வலி இடது பக்கமா, வலது பக்கமா, இரு பக்கங்களிலுமா, அல்லது உறுதியாகத் தெரியவில்லையா?"],
  ["Is this new pain, your usual pain but stronger, something different, or are you not sure?", "这是新的疼痛、平时的疼痛加重、不同的疼痛，还是您不确定？", "Adakah ini kesakitan baharu, kesakitan biasa yang lebih kuat, sesuatu yang berbeza atau anda tidak pasti?", "இது புதிய வலியா, வழக்கமான வலி அதிகரித்ததா, வேறுபட்டதா, அல்லது உறுதியாகத் தெரியவில்லையா?"],
  ["Did it increase before, during, or after the exercise, or are you not sure?", "疼痛是在运动前、运动中还是运动后加重，或者您不确定？", "Adakah kesakitan meningkat sebelum, semasa atau selepas senaman, atau anda tidak pasti?", "வலி உடற்பயிற்சிக்கு முன், போது அல்லது பிறகு அதிகரித்ததா, அல்லது உறுதியாகத் தெரியவில்லையா?"],
  ["Is the pain getting better, staying the same, getting worse, or are you not sure?", "疼痛是好转、保持不变、加重，还是您不确定？", "Adakah kesakitan semakin baik, kekal sama, semakin teruk atau anda tidak pasti?", "வலி குறைகிறதா, அதேபோல் உள்ளதா, அதிகரிக்கிறதா, அல்லது உறுதியாகத் தெரியவில்லையா?"],
  ["Can you move safely alone, do you need someone nearby, or do you need help?", "您能独自安全移动、需要有人在旁边，还是需要帮助？", "Bolehkah anda bergerak dengan selamat sendiri, perlukan seseorang berdekatan atau perlukan bantuan?", "நீங்கள் தனியாக பாதுகாப்பாக நகர முடியுமா, அருகில் ஒருவர் தேவையா, அல்லது உதவி தேவையா?"],
  ["Tell me if you are okay and can move safely, or if you need help.", "请告诉我您是否没事并能安全移动，或是否需要帮助。", "Beritahu saya jika anda okay dan boleh bergerak dengan selamat, atau jika anda perlukan bantuan.", "நீங்கள் நலமாக இருந்து பாதுகாப்பாக நகர முடியுமா, அல்லது உதவி தேவையா என்று கூறவும்."],
  ["Say, I am okay and can move safely, or say, I need help.", "请说“我没事，可以安全移动”，或说“我需要帮助”。", "Sebut, saya okay dan boleh bergerak dengan selamat, atau sebut, saya perlukan bantuan.", "நான் நலமாக இருக்கிறேன், பாதுகாப்பாக நகர முடியும் என்று கூறவும்; அல்லது எனக்கு உதவி தேவை என்று கூறவும்."],
  ["No, none of these", "没有以上情况", "Tidak, tiada satu pun", "இல்லை, இவற்றில் எதுவுமில்லை"],
  ["Yes", "是", "Ya", "ஆம்"],
  ["No", "否", "Tidak", "இல்லை"],
  ["Right now, do you have chest pressure, squeezing, tightness, heaviness, or chest pain?", "您现在是否有胸口受压、挤压感、紧绷感、沉重感或胸痛？", "Adakah anda mengalami tekanan, himpitan, ketat, berat atau sakit dada sekarang?", "இப்போது மார்பில் அழுத்தம், இறுக்கம், பாரம் அல்லது மார்பு வலி உள்ளதா?"],
  ["Are you unusually short of breath or having difficulty breathing right now?", "您现在是否异常呼吸急促或呼吸困难？", "Adakah anda sesak nafas luar biasa atau sukar bernafas sekarang?", "இப்போது வழக்கத்திற்கு மாறாக மூச்சுத்திணறல் அல்லது சுவாசிக்க சிரமம் உள்ளதா?"],
  ["Do you feel dizzy or faint, or have sudden weakness or numbness right now?", "您现在是否感到头晕、晕眩，或突然无力或麻木？", "Adakah anda berasa pening atau hendak pitam, atau mengalami kelemahan atau kebas secara tiba-tiba sekarang?", "இப்போது தலைச்சுற்றல், மயக்கம், திடீர் பலவீனம் அல்லது உணர்வின்மை உள்ளதா?"],
  ["Where are you feeling the pain?", "您哪里感到疼痛？", "Di manakah anda berasa sakit?", "உங்களுக்கு எங்கே வலி உள்ளது?"],
  ["Knee", "膝盖", "Lutut", "முழங்கால்"],
  ["Hip", "髋部", "Pinggul", "இடுப்பு"],
  ["Ankle or foot", "脚踝或脚", "Buku lali atau kaki", "கணுக்கால் அல்லது பாதம்"],
  ["Back", "背部", "Belakang", "முதுகு"],
  ["Shoulder or arm", "肩膀或手臂", "Bahu atau lengan", "தோள் அல்லது கை"],
  ["Other area", "其他部位", "Bahagian lain", "வேறு பகுதி"],
  ["Which side is affected?", "哪一侧受到影响？", "Bahagian mana yang terjejas?", "எந்தப் பக்கம் பாதிக்கப்பட்டுள்ளது?"],
  ["Is this new pain, your usual pain becoming stronger, or something different from what you normally feel?", "这是新的疼痛、平时的疼痛加重，还是与平常不同？", "Adakah ini kesakitan baharu, kesakitan biasa yang semakin kuat, atau sesuatu yang berbeza daripada kebiasaan?", "இது புதிய வலியா, வழக்கமான வலி அதிகரித்ததா, அல்லது வழக்கத்திலிருந்து வேறுபட்டதா?"],
  ["New pain", "新的疼痛", "Kesakitan baharu", "புதிய வலி"],
  ["Usual pain, but stronger", "平时的疼痛，但更强", "Kesakitan biasa, tetapi lebih kuat", "வழக்கமான வலி, ஆனால் அதிகமாக உள்ளது"],
  ["Something different", "与平常不同", "Sesuatu yang berbeza", "வேறுபட்ட ஒன்று"],
  ["When did the pain increase?", "疼痛什么时候加重？", "Bilakah kesakitan meningkat?", "வலி எப்போது அதிகரித்தது?"],
  ["Before I started", "开始前", "Sebelum saya mula", "நான் தொடங்குவதற்கு முன்"],
  ["During this exercise", "进行这项运动时", "Semasa senaman ini", "இந்த உடற்பயிற்சியின் போது"],
  ["Immediately after", "结束后立即", "Sejurus selepas", "முடித்த உடனே"],
  ["Now that you have stopped and rested briefly, is the pain getting better, staying the same, or getting worse?", "现在您已停止并稍作休息，疼痛是好转、保持不变，还是加重？", "Selepas anda berhenti dan berehat seketika, adakah kesakitan semakin baik, kekal sama atau semakin teruk?", "நீங்கள் நிறுத்தி சிறிது ஓய்வெடுத்த பிறகு, வலி குறைகிறதா, அதேபோல் உள்ளதா அல்லது அதிகரிக்கிறதா?"],
  ["Getting better", "正在好转", "Semakin baik", "குறைந்து வருகிறது"],
  ["Staying the same", "保持不变", "Kekal sama", "அதேபோல் உள்ளது"],
  ["Getting worse", "正在加重", "Semakin teruk", "அதிகரித்து வருகிறது"],
  ["Can you sit, stand, or move to a safe position without assistance?", "您能否在无人协助的情况下坐下、站立或移动到安全的位置？", "Bolehkah anda duduk, berdiri atau bergerak ke kedudukan yang selamat tanpa bantuan?", "உதவியின்றி அமரவோ, நிற்கவோ அல்லது பாதுகாப்பான நிலைக்கு நகரவோ முடியுமா?"],
  ["Yes, safely", "可以，且安全", "Ya, dengan selamat", "ஆம், பாதுகாப்பாக முடியும்"],
  ["I need someone nearby", "我需要有人在旁边", "Saya perlukan seseorang berdekatan", "எனக்கு அருகில் ஒருவர் தேவை"],
  ["No, I need help", "不行，我需要帮助", "Tidak, saya perlukan bantuan", "இல்லை, எனக்கு உதவி தேவை"],
  ["Possible fall detected", "检测到可能跌倒", "Kemungkinan jatuh dikesan", "விழுந்திருக்கக்கூடும் எனக் கண்டறியப்பட்டது"],
  ["Are you okay?", "您还好吗？", "Adakah anda okay?", "நீங்கள் நலமாக இருக்கிறீர்களா?"],
  ["We noticed an unexpected movement and stopped the exercise. This can be a false alarm.", "我们检测到异常动作，已停止运动。这也可能是误报。", "Kami mengesan pergerakan yang tidak dijangka dan menghentikan senaman. Ini mungkin amaran palsu.", "எதிர்பாராத இயக்கம் கண்டறியப்பட்டதால் உடற்பயிற்சி நிறுத்தப்பட்டது. இது தவறான எச்சரிக்கையாக இருக்கலாம்."],
  ["We noticed a possible fall and stopped the exercise. Are you okay? Tell me how you feel, or use one of the large buttons.", "我们检测到可能跌倒，已停止运动。您还好吗？请告诉我您的感受，或使用其中一个大按钮。", "Kami mengesan kemungkinan jatuh dan menghentikan senaman. Adakah anda okay? Beritahu perasaan anda atau gunakan salah satu butang besar.", "நீங்கள் விழுந்திருக்கக்கூடும் எனக் கண்டறிந்து உடற்பயிற்சியை நிறுத்தியுள்ளோம். நீங்கள் நலமாக இருக்கிறீர்களா? எப்படி உணர்கிறீர்கள் என்று கூறவும் அல்லது பெரிய பொத்தான்களில் ஒன்றைப் பயன்படுத்தவும்."],
  ["Thirty seconds left to answer.", "还剩30秒回答。", "Tiga puluh saat lagi untuk menjawab.", "பதிலளிக்க இன்னும் முப்பது விநாடிகள் உள்ளன."],
  ["Ten seconds left to answer.", "还剩10秒回答。", "Sepuluh saat lagi untuk menjawab.", "பதிலளிக்க இன்னும் பத்து விநாடிகள் உள்ளன."],
  ["Five seconds left to answer.", "还剩5秒回答。", "Lima saat lagi untuk menjawab.", "பதிலளிக்க இன்னும் ஐந்து விநாடிகள் உள்ளன."],
  ["seconds to answer before the safety check escalates", "秒内回答，否则安全检查将升级", "saat untuk menjawab sebelum pemeriksaan keselamatan ditingkatkan", "பாதுகாப்புச் சோதனை அடுத்த நிலைக்குச் செல்லும் முன் பதிலளிக்க வேண்டிய விநாடிகள்"],
  ["I’m okay", "我没事", "Saya okay", "நான் நலமாக இருக்கிறேன்"],
  ["Cancel this check and stop the exercise", "取消检查并停止运动", "Batalkan pemeriksaan ini dan hentikan senaman", "இந்தச் சோதனையை ரத்துசெய்து உடற்பயிற்சியை நிறுத்தவும்"],
  ["I need help", "我需要帮助", "Saya perlukan bantuan", "எனக்கு உதவி தேவை"],
  ["Stop the exercise and show help instructions", "停止运动并显示求助说明", "Hentikan senaman dan tunjukkan arahan bantuan", "உடற்பயிற்சியை நிறுத்தி உதவி வழிமுறைகளைக் காட்டவும்"],
  ["Exercise stopped", "运动已停止", "Senaman dihentikan", "உடற்பயிற்சி நிறுத்தப்பட்டது"],
  ["Your response was recorded.", "您的回答已记录。", "Jawapan anda telah direkodkan.", "உங்கள் பதில் பதிவு செய்யப்பட்டது."],
  ["Take a moment before deciding whether to exercise again.", "请稍作休息，再决定是否重新运动。", "Berehat sebentar sebelum memutuskan sama ada mahu bersenam lagi.", "மீண்டும் உடற்பயிற்சி செய்வதா என்பதை முடிவு செய்வதற்கு முன் சிறிது ஓய்வெடுக்கவும்."],
  ["Call 995 now", "立即拨打995", "Hubungi 995 sekarang", "இப்போது 995-ஐ அழைக்கவும்"],
  ["Return to my home", "返回我的主页", "Kembali ke halaman saya", "எனது முகப்பிற்குத் திரும்பவும்"],
  ["End this exercise for today", "今天停止这项运动", "Tamatkan senaman ini untuk hari ini", "இன்றைக்கு இந்த உடற்பயிற்சியை நிறுத்தவும்"],
  ["Stop exercising and get help now", "停止运动并立即求助", "Berhenti bersenam dan dapatkan bantuan sekarang", "உடற்பயிற்சியை நிறுத்தி உடனே உதவி பெறவும்"],
  ["Finish safety check", "完成安全检查", "Selesaikan pemeriksaan keselamatan", "பாதுகாப்புச் சோதனையை முடிக்கவும்"],
  ["Email", "电子邮箱", "E-mel", "மின்னஞ்சல்"],
  ["Password", "密码", "Kata laluan", "கடவுச்சொல்"],
  ["Forgot password?", "忘记密码？", "Lupa kata laluan?", "கடவுச்சொல்லை மறந்துவிட்டீர்களா?"],
  ["First name", "名字", "Nama pertama", "முதல் பெயர்"],
  ["Last name", "姓氏", "Nama keluarga", "கடைசிப் பெயர்"],
  ["Account type", "账户类型", "Jenis akaun", "கணக்கு வகை"],
  ["Patient", "患者", "Pesakit", "நோயாளர்"],
  ["Physiotherapist / Clinician", "物理治疗师 / 临床医生", "Ahli fisioterapi / Klinisian", "உடற்பயிற்சி சிகிச்சையாளர் / மருத்துவர்"],
  ["Verify and sign in", "验证并登录", "Sahkan dan log masuk", "சரிபார்த்து உள்நுழையவும்"],
  ["Resend code", "重新发送验证码", "Hantar semula kod", "குறியீட்டை மீண்டும் அனுப்பவும்"],
  ["Back to sign in", "返回登录", "Kembali ke log masuk", "உள்நுழைவுக்குத் திரும்பவும்"],
  ["Close", "关闭", "Tutup", "மூடவும்"],
  ["Your personal AI profile", "您的个人AI资料", "Profil AI peribadi anda", "உங்கள் தனிப்பட்ட AI சுயவிவரம்"],
  ["Guidance that fits you.", "适合您的指导。", "Panduan yang sesuai untuk anda.", "உங்களுக்கு ஏற்ற வழிகாட்டுதல்."],
  ["Your PhysioVision account", "您的PhysioVision账户", "Akaun PhysioVision anda", "உங்கள் PhysioVision கணக்கு"],
  ["Patient account", "患者账户", "Akaun pesakit", "நோயாளர் கணக்கு"],
  ["Preferred name", "常用姓名", "Nama pilihan", "விருப்பப் பெயர்"],
  ["Age", "年龄", "Umur", "வயது"],
  ["years", "岁", "tahun", "ஆண்டுகள்"],
  ["Main goal", "主要目标", "Matlamat utama", "முக்கிய இலக்கு"],
  ["Stronger knees", "增强膝盖力量", "Lutut lebih kuat", "வலுவான முழங்கால்கள்"],
  ["Better balance", "改善平衡", "Keseimbangan lebih baik", "சிறந்த சமநிலை"],
  ["Move with less stiffness", "减轻僵硬，活动更自如", "Bergerak dengan kurang kekakuan", "குறைந்த இறுக்கத்துடன் நகரவும்"],
  ["Stay active", "保持活跃", "Kekal aktif", "சுறுசுறுப்பாக இருக்கவும்"],
  ["Stronger hips", "增强髋部力量", "Pinggul lebih kuat", "வலுவான இடுப்பு"],
  ["Better ankle movement", "改善脚踝活动", "Pergerakan buku lali lebih baik", "சிறந்த கணுக்கால் இயக்கம்"],
  ["Walk with confidence", "更有信心地行走", "Berjalan dengan yakin", "நம்பிக்கையுடன் நடக்கவும்"],
  ["Other", "其他", "Lain-lain", "மற்றவை"],
  ["Usual mobility", "日常行动能力", "Pergerakan biasa", "வழக்கமான நகர்வு"],
  ["Independent", "独立行动", "Berdikari", "சுயமாக"],
  ["Use a walking aid", "使用助行器", "Gunakan alat bantuan berjalan", "நடை உதவிக் கருவியைப் பயன்படுத்துகிறேன்"],
  ["Need another person nearby", "需要有人在旁边", "Perlukan orang lain berdekatan", "அருகில் மற்றொருவர் தேவை"],
  ["Coaching style", "指导方式", "Gaya bimbingan", "வழிகாட்டும் முறை"],
  ["Gentle and encouraging", "温和并鼓励", "Lembut dan menggalakkan", "மென்மையாகவும் ஊக்கமளிப்பதாகவும்"],
  ["Short and direct", "简短直接", "Ringkas dan terus", "சுருக்கமாகவும் நேரடியாகவும்"],
  ["Explain each correction", "解释每项纠正", "Terangkan setiap pembetulan", "ஒவ்வொரு திருத்தத்தையும் விளக்கவும்"],
  ["Current activity", "目前活动量", "Aktiviti semasa", "தற்போதைய செயல்பாடு"],
  ["Lightly active", "轻度活跃", "Aktif secara ringan", "லேசாகச் சுறுசுறுப்பாக"],
  ["Mostly seated", "大部分时间坐着", "Kebanyakannya duduk", "பெரும்பாலும் அமர்ந்திருப்பவர்"],
  ["Active most days", "大多数日子都活跃", "Aktif hampir setiap hari", "பெரும்பாலான நாட்களில் சுறுசுறுப்பாக"],
  ["Emergency contact", "紧急联系人", "Hubungan kecemasan", "அவசரத் தொடர்பு"],
  ["Optional · recommended", "可选 · 建议填写", "Pilihan · disyorkan", "விருப்பமானது · பரிந்துரைக்கப்படுகிறது"],
  ["Contact name", "联系人姓名", "Nama hubungan", "தொடர்பு நபரின் பெயர்"],
  ["Contact’s full name", "联系人全名", "Nama penuh hubungan", "தொடர்பு நபரின் முழுப் பெயர்"],
  ["Relationship", "关系", "Hubungan", "உறவு"],
  ["Choose relationship", "选择关系", "Pilih hubungan", "உறவைத் தேர்ந்தெடுக்கவும்"],
  ["Spouse or partner", "配偶或伴侣", "Pasangan", "துணைவர் அல்லது இணையர்"],
  ["Family member", "家人", "Ahli keluarga", "குடும்ப உறுப்பினர்"],
  ["Friend", "朋友", "Rakan", "நண்பர்"],
  ["Caregiver", "照护者", "Penjaga", "பராமரிப்பாளர்"],
  ["Phone number", "电话号码", "Nombor telefon", "தொலைபேசி எண்"],
  ["Phone verification required", "需要验证电话号码", "Pengesahan telefon diperlukan", "தொலைபேசி சரிபார்ப்பு தேவை"],
  ["Send verification code", "发送验证码", "Hantar kod pengesahan", "சரிபார்ப்புக் குறியீட்டை அனுப்பவும்"],
  ["Code received by your contact", "联系人收到的验证码", "Kod yang diterima oleh hubungan anda", "உங்கள் தொடர்பு நபர் பெற்ற குறியீடு"],
  ["Verify contact", "验证联系人", "Sahkan hubungan", "தொடர்பு நபரைச் சரிபார்க்கவும்"],
  ["Save my profile", "保存我的资料", "Simpan profil saya", "எனது சுயவிவரத்தைச் சேமிக்கவும்"],
];

const TRANSLATIONS = Object.freeze({
  "zh-SG": new Map(TRANSLATION_ROWS.map(([en, zh]) => [en, zh])),
  "ms-SG": new Map(TRANSLATION_ROWS.map(([en, , ms]) => [en, ms])),
  "ta-SG": new Map(TRANSLATION_ROWS.map(([en, , , ta]) => [en, ta])),
});

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function preferredStoredLocale() {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    if (SUPPORTED_CODES.has(stored)) return stored;
  } catch (_) {
    // Storage can be unavailable in private browsing; keep the page usable.
  }
  const browserLocale = String(globalThis.navigator?.language ?? "");
  const prefix = browserLocale.toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.find(({ code }) => (
    code.toLowerCase().startsWith(`${prefix}-`)
  ))?.code ?? "en-SG";
}

let activeLocale = preferredStoredLocale();
let observer = null;
let translationPassActive = false;
let initialized = false;
const textNodeState = new WeakMap();
const attributeState = new WeakMap();

export function getLocale() {
  return activeLocale;
}

export function getSpeechLocale(locale = activeLocale) {
  return SUPPORTED_LANGUAGES.find(({ code }) => code === locale)?.speech
    ?? "en-SG";
}

export function getLanguageLabel(locale = activeLocale) {
  return SUPPORTED_LANGUAGES.find(({ code }) => code === locale)?.label
    ?? "English";
}

function translateTemplate(text, locale) {
  const templates = {
    "zh-SG": [
      [/^Pain level (\d+) out of 10$/, (_, level) => `疼痛程度为10分中的${level}分`],
      [/^Pain level (\d+) recorded$/, (_, level) => `疼痛程度${level}已记录`],
      [/^I heard that your pain is (\d+) out of 10\. Is that correct\?$/, (_, level) => `我听到您的疼痛程度是10分中的${level}分。正确吗？`],
      [/^I heard that your pain is now (\d+) out of 10\. Before it was (\d+)\. Is that correct\?$/, (_, level, before) => `我听到您现在的疼痛程度是10分中的${level}分，之前是${before}分。正确吗？`],
      [/^Thank you\. I have recorded your pain level as (\d+) out of 10\.$/, (_, level) => `谢谢。我已记录您的疼痛程度为10分中的${level}分。`],
      [/^Exercise (\d+) of (\d+)$/, (_, current, total) => `第${current}项运动，共${total}项`],
    ],
    "ms-SG": [
      [/^Pain level (\d+) out of 10$/, (_, level) => `Tahap kesakitan ${level} daripada 10`],
      [/^Pain level (\d+) recorded$/, (_, level) => `Tahap kesakitan ${level} direkodkan`],
      [/^I heard that your pain is (\d+) out of 10\. Is that correct\?$/, (_, level) => `Saya mendengar tahap kesakitan anda ialah ${level} daripada 10. Adakah itu betul?`],
      [/^I heard that your pain is now (\d+) out of 10\. Before it was (\d+)\. Is that correct\?$/, (_, level, before) => `Saya mendengar tahap kesakitan anda sekarang ialah ${level} daripada 10. Sebelum ini ${before}. Adakah itu betul?`],
      [/^Thank you\. I have recorded your pain level as (\d+) out of 10\.$/, (_, level) => `Terima kasih. Saya telah merekodkan tahap kesakitan anda sebagai ${level} daripada 10.`],
      [/^Exercise (\d+) of (\d+)$/, (_, current, total) => `Senaman ${current} daripada ${total}`],
    ],
    "ta-SG": [
      [/^Pain level (\d+) out of 10$/, (_, level) => `வலி அளவு 10-இல் ${level}`],
      [/^Pain level (\d+) recorded$/, (_, level) => `வலி அளவு ${level} பதிவு செய்யப்பட்டது`],
      [/^I heard that your pain is (\d+) out of 10\. Is that correct\?$/, (_, level) => `உங்கள் வலி அளவு 10-இல் ${level} என்று கேட்டேன். அது சரியா?`],
      [/^I heard that your pain is now (\d+) out of 10\. Before it was (\d+)\. Is that correct\?$/, (_, level, before) => `உங்கள் வலி அளவு இப்போது 10-இல் ${level} என்றும், முன்பு ${before} என்றும் கேட்டேன். அது சரியா?`],
      [/^Thank you\. I have recorded your pain level as (\d+) out of 10\.$/, (_, level) => `நன்றி. உங்கள் வலி அளவை 10-இல் ${level} எனப் பதிவு செய்துள்ளேன்.`],
      [/^Exercise (\d+) of (\d+)$/, (_, current, total) => `உடற்பயிற்சி ${current} / ${total}`],
    ],
  };
  for (const [pattern, replacement] of templates[locale] ?? []) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return "";
}

function translateContainedPhrases(text, locale) {
  let translated = text;
  const entries = [...(TRANSLATIONS[locale]?.entries() ?? [])]
    .filter(([source]) => source.length >= 20 && text.includes(source))
    .sort(([left], [right]) => right.length - left.length);
  entries.forEach(([source, replacement]) => {
    translated = translated.replaceAll(source, replacement);
  });
  return translated === text ? "" : translated;
}

export function translateText(value, locale = activeLocale) {
  const text = normalizeText(value);
  if (!text || locale === "en-SG" || !TRANSLATIONS[locale]) return text;
  return TRANSLATIONS[locale].get(text)
    ?? (translateTemplate(text, locale)
      || translateContainedPhrases(text, locale)
      || text);
}

function preserveOuterWhitespace(original, translated) {
  const leading = String(original).match(/^\s*/)?.[0] ?? "";
  const trailing = String(original).match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function shouldIgnore(node) {
  const parent = node.nodeType === 1 ? node : node.parentElement;
  return !parent || Boolean(parent.closest(
    "script, style, noscript, textarea, [data-i18n-ignore]"
  ));
}

function translateTextNode(node) {
  if (!node?.nodeValue || shouldIgnore(node)) return;
  const current = node.nodeValue;
  let state = textNodeState.get(node);
  if (!state || current !== state.rendered) {
    state = { source: current, rendered: current };
  }
  const translated = translateText(state.source);
  const rendered = preserveOuterWhitespace(state.source, translated);
  state.rendered = rendered;
  textNodeState.set(node, state);
  if (current !== rendered) node.nodeValue = rendered;
}

function translateAttributes(element) {
  if (shouldIgnore(element)) return;
  const names = ["aria-label", "placeholder", "title"];
  let states = attributeState.get(element) ?? new Map();
  names.forEach((name) => {
    if (!element.hasAttribute(name)) return;
    const current = element.getAttribute(name) ?? "";
    let state = states.get(name);
    if (!state || current !== state.rendered) {
      state = { source: current, rendered: current };
    }
    const rendered = translateText(state.source);
    state.rendered = rendered;
    states.set(name, state);
    if (current !== rendered) element.setAttribute(name, rendered);
  });
  attributeState.set(element, states);
}

function translateTree(root = globalThis.document?.body) {
  if (!root || translationPassActive) return;
  translationPassActive = true;
  try {
    if (root.nodeType === 3) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType === 1) translateAttributes(root);
    const walker = document.createTreeWalker(
      root,
      globalThis.NodeFilter?.SHOW_TEXT ?? 4
    );
    let node = walker.nextNode();
    while (node) {
      translateTextNode(node);
      node = walker.nextNode();
    }
    root.querySelectorAll?.("[aria-label], [placeholder], [title]")
      .forEach(translateAttributes);
  } finally {
    translationPassActive = false;
  }
}

function syncSelectors() {
  document.querySelectorAll("[data-language-selector]").forEach((select) => {
    select.value = activeLocale;
    if (select.dataset.languageBound === "true") return;
    select.dataset.languageBound = "true";
    select.addEventListener("change", () => setLocale(select.value));
  });
}

export function setLocale(locale, { persist = true, announce = true } = {}) {
  if (!SUPPORTED_CODES.has(locale)) return false;
  activeLocale = locale;
  if (persist) {
    try {
      globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, locale);
    } catch (_) {
      // Keep the in-memory preference when persistent storage is unavailable.
    }
  }
  if (globalThis.document) {
    document.documentElement.lang = locale;
    syncSelectors();
    translateTree(document.body);
  }
  globalThis.window?.dispatchEvent?.(new CustomEvent(
    "physiovision:language-change",
    { detail: { locale, speechLocale: getSpeechLocale(locale) } }
  ));
  if (announce && globalThis.document) {
    const status = document.getElementById("languageStatus");
    if (status) {
      const messages = {
        "en-SG": "Language changed to English.",
        "zh-SG": "语言已更改为华语。",
        "ms-SG": "Bahasa ditukar kepada Bahasa Melayu.",
        "ta-SG": "மொழி தமிழுக்கு மாற்றப்பட்டது.",
      };
      status.textContent = messages[locale];
    }
  }
  return true;
}

function initialize() {
  if (initialized || !globalThis.document?.body) return;
  initialized = true;
  document.documentElement.lang = activeLocale;
  syncSelectors();
  translateTree(document.body);
  observer = new MutationObserver((mutations) => {
    if (translationPassActive) return;
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        translateTextNode(mutation.target);
      } else {
        mutation.addedNodes.forEach((node) => translateTree(node));
      }
    });
  });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

if (globalThis.document) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
}
