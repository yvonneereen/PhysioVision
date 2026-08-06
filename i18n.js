const LANGUAGE_STORAGE_KEY = "physiovision.language.v1";
const LANGUAGE_EXPLICIT_STORAGE_KEY = "physiovision.language.explicit.v1";

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
  ["A gentle 3-day balance and lower-body stability routine designed for Yvonne using a chair for support.", "为Yvonne设计的温和三天平衡与下肢稳定训练，并使用椅子辅助。", "Rutin keseimbangan dan kestabilan bahagian bawah badan selama 3 hari yang lembut, direka untuk Yvonne dengan sokongan kerusi.", "Yvonne-க்காக வடிவமைக்கப்பட்ட, நாற்காலி ஆதரவுடன் செய்யும் மென்மையான 3 நாள் சமநிலை மற்றும் கீழ் உடல் நிலைத்தன்மைப் பயிற்சி."],
  ["Leg Strength and Ankle Balance", "腿部力量与脚踝平衡", "Kekuatan kaki dan keseimbangan buku lali", "கால் வலிமை மற்றும் கணுக்கால் சமநிலை"],
  ["Hip Stability and Balance", "髋部稳定与平衡", "Kestabilan pinggul dan keseimbangan", "இடுப்பு நிலைத்தன்மை மற்றும் சமநிலை"],
  ["Total Balance and Support", "全身平衡与支撑", "Keseimbangan menyeluruh dan sokongan", "முழுமையான சமநிலை மற்றும் ஆதரவு"],
  ["Half squats", "半蹲", "Separuh cangkung", "அரை குந்துதல்"],
  ["Seated leg extensions", "坐姿伸膝", "Luruskan kaki sambil duduk", "அமர்ந்தபடி காலை நீட்டுதல்"],
  ["Heel cord stretch", "跟腱拉伸", "Regangan tendon tumit", "குதிகால் தசைநார் நீட்டுதல்"],
  ["Calf raises", "提踵", "Angkat tumit", "குதிகால் உயர்த்துதல்"],
  ["Hamstring curls", "腿后肌弯举", "Lengkuk hamstring", "பின்தொடை மடக்குதல்"],
  ["Standing hip abduction", "站立髋外展", "Abduksi pinggul berdiri", "நின்றபடி இடுப்பை வெளிப்புறமாக நகர்த்துதல்"],
  ["Supine straight-leg raises", "仰卧直腿抬高", "Angkat kaki lurus secara terlentang", "மல்லாந்து படுத்து நேராக காலை உயர்த்துதல்"],
  ["Side-lying hip adduction", "侧卧髋内收", "Adduksi pinggul mengiring", "பக்கவாட்டில் படுத்து இடுப்பை உட்புறமாக நகர்த்துதல்"],
  ["Elastic-band leg presses", "弹力带腿部推蹬", "Tekan kaki dengan jalur elastik", "எலாஸ்டிக் பட்டையுடன் கால் தள்ளுதல்"],
  ["Mon", "周一", "Isn", "திங்கள்"],
  ["Tue", "周二", "Sel", "செவ்வாய்"],
  ["Wed", "周三", "Rab", "புதன்"],
  ["Thu", "周四", "Kha", "வியாழன்"],
  ["Fri", "周五", "Jum", "வெள்ளி"],
  ["Sat", "周六", "Sab", "சனி"],
  ["Sun", "周日", "Ahd", "ஞாயிறு"],
  ["1 set of 6–10 repetitions", "1组，每组6–10次", "1 set sebanyak 6–10 ulangan", "6–10 மறுபடியல்கள் கொண்ட 1 செட்"],
  ["Uses one set of 6–10 repetitions for each exercise to keep the starting dose manageable.", "每项运动进行1组，每组6–10次，让起始运动量更容易掌握。", "Gunakan satu set sebanyak 6–10 ulangan bagi setiap senaman supaya dos permulaan lebih mudah dikendalikan.", "தொடக்க அளவை எளிதாக வைத்திருக்க ஒவ்வொரு உடற்பயிற்சிக்கும் 6–10 மறுபடியல்கள் கொண்ட ஒரு செட்டை பயன்படுத்துகிறது."],
  ["I will match your goal, weekly schedule and equipment, then show my reasoning before you decide whether to accept the draft.", "我会根据您的目标、每周安排和设备制定计划，并在您决定是否接受草案前说明理由。", "Saya akan memadankan matlamat, jadual mingguan dan peralatan anda, kemudian menunjukkan alasan saya sebelum anda memutuskan sama ada mahu menerima draf.", "உங்கள் இலக்கு, வார அட்டவணை மற்றும் உபகரணங்களுக்கு ஏற்ப திட்டத்தை அமைத்து, வரைவை ஏற்கலாமா என்று நீங்கள் முடிவு செய்வதற்கு முன் காரணங்களை விளக்குவேன்."],
  ["Every selected exercise starts with 1 set of 6–10 repetitions.", "每项选定的运动从1组、每组6–10次开始。", "Setiap senaman yang dipilih bermula dengan 1 set sebanyak 6–10 ulangan.", "தேர்ந்தெடுக்கப்பட்ட ஒவ்வொரு உடற்பயிற்சியும் 6–10 மறுபடியல்கள் கொண்ட 1 செட்டுடன் தொடங்கும்."],
  ["For example: use the gentlest suitable exercises", "例如：使用最温和且合适的运动", "Contohnya: gunakan senaman sesuai yang paling ringan", "உதாரணமாக: மிகவும் மென்மையான பொருத்தமான உடற்பயிற்சிகளைப் பயன்படுத்தவும்"],
  ["Ask your AI", "询问您的AI助手", "Tanya AI anda", "உங்கள் AI-யிடம் கேளுங்கள்"],
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
  ["Face your device and keep a stable chair nearby.", "面向设备，并在旁边放一张稳固的椅子。", "Hadap peranti anda dan letakkan kerusi yang kukuh berdekatan.", "உங்கள் சாதனத்தை நோக்கி நிற்கவும்; அருகில் உறுதியான நாற்காலியை வைக்கவும்."],
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
  // Signed-in patient dashboard. Keep these interface strings bundled for
  // every supported language because most of them are inserted after login.
  ["Available PhysioVision features", "可用的PhysioVision功能", "Ciri PhysioVision yang tersedia", "கிடைக்கும் PhysioVision அம்சங்கள்"],
  ["Choose your exercise pathway to open the correct patient functions.", "请选择您的运动路径，以开启相应的患者功能。", "Pilih laluan senaman anda untuk membuka fungsi pesakit yang betul.", "சரியான நோயாளர் அம்சங்களைத் திறக்க உங்கள் உடற்பயிற்சிப் பாதையைத் தேர்ந்தெடுக்கவும்."],
  ["Review your physiotherapist-assigned plan, start approved exercises and follow your progress.", "查看物理治疗师指定的计划，开始获准的运动，并跟进您的进度。", "Semak pelan yang ditetapkan oleh ahli fisioterapi, mulakan senaman yang diluluskan dan ikuti kemajuan anda.", "உங்கள் உடற்பயிற்சி சிகிச்சையாளர் வழங்கிய திட்டத்தைப் பார்த்து, அனுமதிக்கப்பட்ட பயிற்சிகளைத் தொடங்கி, உங்கள் முன்னேற்றத்தைக் கண்காணிக்கவும்."],
  ["For older adults without a diagnosed condition or clinician restrictions. Use AI support to create a conservative wellness plan, complete camera-guided exercises, record pain check-ins and follow your movement progress over time.", "适用于没有确诊疾病或临床限制的年长者。使用AI支持制定保守的健康计划、完成摄像头指导的运动、记录疼痛检查，并长期跟进动作进度。", "Untuk warga emas tanpa keadaan yang didiagnosis atau sekatan klinisian. Gunakan sokongan AI untuk mencipta pelan kesejahteraan yang berhati-hati, lakukan senaman berpandukan kamera, rekod pemeriksaan kesakitan dan ikuti kemajuan pergerakan anda dari semasa ke semasa.", "நோய் கண்டறிதல் அல்லது மருத்துவரின் கட்டுப்பாடுகள் இல்லாத மூத்தவர்களுக்காக. AI உதவியுடன் பாதுகாப்பான நலவாழ்வுத் திட்டத்தை உருவாக்கி, கேமரா வழிகாட்டும் பயிற்சிகளைச் செய்து, வலி சோதனைகளைப் பதிவு செய்து, காலப்போக்கில் உங்கள் இயக்க முன்னேற்றத்தைக் கண்காணிக்கவும்."],
  ["Specialist-assigned programme", "专科人员指定的计划", "Program yang ditetapkan pakar", "நிபுணர் வழங்கிய திட்டம்"],
  ["Approved movement guidance", "经批准的运动指导", "Panduan pergerakan yang diluluskan", "அனுமதிக்கப்பட்ட இயக்க வழிகாட்டுதல்"],
  ["Progress and pain trends", "进度和疼痛趋势", "Trend kemajuan dan kesakitan", "முன்னேற்றம் மற்றும் வலிப் போக்குகள்"],
  ["AI-assisted wellness plan", "AI辅助健康计划", "Pelan kesejahteraan dibantu AI", "AI உதவியுடன் நலவாழ்வுத் திட்டம்"],
  ["Camera-guided exercises", "摄像头指导的运动", "Senaman berpandukan kamera", "கேமரா வழிகாட்டும் உடற்பயிற்சிகள்"],
  ["Pain check-ins", "疼痛检查", "Pemeriksaan kesakitan", "வலி சோதனைகள்"],
  ["Movement progress trends", "动作进度趋势", "Trend kemajuan pergerakan", "இயக்க முன்னேற்றப் போக்குகள்"],
  ["Start", "开始", "Mula", "தொடங்கவும்"],
  ["Awaiting assignment", "等待指定", "Menunggu penetapan", "ஒதுக்கீட்டிற்காகக் காத்திருக்கிறது"],
  ["You are on a physiotherapist-guided pathway, but no current exercise has been assigned yet.", "您目前使用物理治疗师指导的路径，但还没有被指定任何运动。", "Anda berada dalam laluan berpandukan ahli fisioterapi, tetapi belum ada senaman semasa yang ditetapkan.", "நீங்கள் உடற்பயிற்சி சிகிச்சையாளர் வழிகாட்டும் பாதையில் உள்ளீர்கள்; ஆனால் தற்போது எந்தப் பயிற்சியும் ஒதுக்கப்படவில்லை."],
  ["Your specialist is preparing the detailed plan", "您的专科人员正在准备详细计划", "Pakar anda sedang menyediakan pelan terperinci", "உங்கள் நிபுணர் விரிவான திட்டத்தைத் தயாரிக்கிறார்"],
  ["Exercises stay locked until your physiotherapist assigns the movement, dose and restrictions.", "在物理治疗师指定动作、剂量和限制之前，运动将保持锁定。", "Senaman kekal dikunci sehingga ahli fisioterapi menetapkan pergerakan, dos dan sekatan.", "இயக்கம், அளவு மற்றும் கட்டுப்பாடுகளை உங்கள் உடற்பயிற்சி சிகிச்சையாளர் ஒதுக்கும் வரை பயிற்சிகள் பூட்டப்பட்டிருக்கும்."],
  ["Use the single Consultation card if you need to contact a physiotherapist.", "如需联系物理治疗师，请使用咨询卡片。", "Gunakan kad Konsultasi jika anda perlu menghubungi ahli fisioterapi.", "உடற்பயிற்சி சிகிச்சையாளரைத் தொடர்புகொள்ள வேண்டுமெனில் ஆலோசனை அட்டையைப் பயன்படுத்தவும்."],
  ["Check for my assigned plan", "检查我获指定的计划", "Semak pelan yang ditetapkan untuk saya", "எனக்கு ஒதுக்கப்பட்ட திட்டத்தைச் சரிபார்க்கவும்"],
  ["Check for assigned exercises", "检查获指定的运动", "Semak senaman yang ditetapkan", "ஒதுக்கப்பட்ட பயிற்சிகளைச் சரிபார்க்கவும்"],
  ["Prototype sample", "原型示例", "Sampel prototaip", "முன்மாதிரி மாதிரி"],
  ["Specialist assigned", "专科人员已指定", "Ditetapkan oleh pakar", "நிபுணரால் ஒதுக்கப்பட்டது"],
  ["Example: early rehabilitation after total knee replacement. These sample doses are interface data, not instructions for a real patient.", "示例：全膝关节置换术后的早期康复。这些示例剂量是界面数据，并非给真实患者的指示。", "Contoh: pemulihan awal selepas penggantian lutut penuh. Dos sampel ini ialah data antara muka, bukan arahan untuk pesakit sebenar.", "எடுத்துக்காட்டு: முழு முழங்கால் மாற்று அறுவைசிகிச்சைக்குப் பிந்தைய ஆரம்ப மறுவாழ்வு. இந்த மாதிரி அளவுகள் இடைமுகத் தரவு மட்டுமே; உண்மையான நோயாளிக்கான வழிமுறைகள் அல்ல."],
  ["No additional specialist note.", "没有其他专科人员备注。", "Tiada nota tambahan daripada pakar.", "கூடுதல் நிபுணர் குறிப்பு இல்லை."],
  ["Start assigned exercises", "开始获指定的运动", "Mulakan senaman yang ditetapkan", "ஒதுக்கப்பட்ட பயிற்சிகளைத் தொடங்கவும்"],
  ["Prototype display programme—not a personal prescription", "原型展示计划——并非个人处方", "Program paparan prototaip—bukan preskripsi peribadi", "முன்மாதிரி காட்சித் திட்டம்—தனிப்பட்ட மருந்துச் சீட்டு அல்ல"],
  ["This sample shows an early total-knee-replacement rehabilitation pathway. A real patient must follow their own surgeon and physiotherapist’s instructions.", "此示例展示全膝关节置换术后的早期康复路径。真实患者必须遵循自己的外科医生和物理治疗师的指示。", "Sampel ini menunjukkan laluan pemulihan awal selepas penggantian lutut penuh. Pesakit sebenar mesti mengikut arahan pakar bedah dan ahli fisioterapi mereka sendiri.", "இந்த மாதிரி முழு முழங்கால் மாற்று அறுவைசிகிச்சைக்குப் பிந்தைய ஆரம்ப மறுவாழ்வுப் பாதையைக் காட்டுகிறது. உண்மையான நோயாளர் தமது அறுவைசிகிச்சை நிபுணர் மற்றும் உடற்பயிற்சி சிகிச்சையாளரின் அறிவுறுத்தல்களைப் பின்பற்ற வேண்டும்."],
  ["View the Mass General protocol used as the source framework", "查看作为参考框架的Mass General方案", "Lihat protokol Mass General yang digunakan sebagai rangka sumber", "ஆதாரக் கட்டமைப்பாகப் பயன்படுத்திய Mass General நெறிமுறையைப் பார்க்கவும்"],
  ["Heel slides", "脚跟滑动", "Gelongsor tumit", "குதிகால் சறுக்கல்கள்"],
  ["Supine bridge", "仰卧桥式", "Jambatan baring", "மல்லாந்த பாலம்"],
  ["Clamshell", "蚌式开合", "Senaman kulit kerang", "கிளாம்ஷெல்"],
  ["Demo dose only. Use a comfortable, physiotherapist-approved range and do not force the knee through sharp pain.", "仅为示范剂量。请使用舒适且经物理治疗师批准的幅度；如有剧烈疼痛，不要强行弯曲膝盖。", "Dos demonstrasi sahaja. Gunakan julat selesa yang diluluskan ahli fisioterapi dan jangan paksa lutut jika terasa sakit tajam.", "இது செயல்விளக்க அளவு மட்டுமே. உடற்பயிற்சி சிகிச்சையாளர் அனுமதித்த வசதியான வரம்பைப் பயன்படுத்தவும்; கூர்மையான வலி இருந்தால் முழங்காலை வற்புறுத்த வேண்டாம்."],
  ["Demo dose only. Keep the movement controlled and use it only when it is permitted by the patient’s real post-operative plan.", "仅为示范剂量。保持动作受控，并只在患者真实的术后计划允许时使用。", "Dos demonstrasi sahaja. Pastikan pergerakan terkawal dan gunakan hanya apabila dibenarkan oleh pelan sebenar selepas pembedahan pesakit.", "இது செயல்விளக்க அளவு மட்டுமே. இயக்கத்தைக் கட்டுப்பாட்டுடன் செய்து, நோயாளியின் உண்மையான அறுவைசிகிச்சைக்குப் பிந்தைய திட்டம் அனுமதித்தால் மட்டுமே பயன்படுத்தவும்."],
  ["Demo dose only. Follow surgical precautions and stop if pain or swelling increases.", "仅为示范剂量。遵循手术注意事项；如果疼痛或肿胀加重，请停止。", "Dos demonstrasi sahaja. Ikuti langkah berjaga-jaga pembedahan dan berhenti jika sakit atau bengkak bertambah.", "இது செயல்விளக்க அளவு மட்டுமே. அறுவைசிகிச்சை முன்னெச்சரிக்கைகளைப் பின்பற்றி, வலி அல்லது வீக்கம் அதிகரித்தால் நிறுத்தவும்."],
  ["We are loading the exercises available for your care pathway.", "正在加载您护理路径中可用的运动。", "Kami sedang memuatkan senaman yang tersedia untuk laluan penjagaan anda.", "உங்கள் பராமரிப்புப் பாதையில் கிடைக்கும் பயிற்சிகள் ஏற்றப்படுகின்றன."],
  ["Complete guided sessions and pain check-ins to begin your trend.", "完成指导训练和疼痛检查，即可开始建立您的趋势。", "Lengkapkan sesi berpandu dan pemeriksaan kesakitan untuk memulakan trend anda.", "உங்கள் போக்கைத் தொடங்க வழிகாட்டப்பட்ட அமர்வுகளையும் வலி சோதனைகளையும் முடிக்கவும்."],
  ["No movement-quality trend is available yet", "还没有动作质量趋势", "Trend kualiti pergerakan belum tersedia", "இயக்கத் தரப் போக்கு இன்னும் கிடைக்கவில்லை"],
  ["Early indicators only. The final clinical trend criteria are still being validated and will remain separate from AI interpretation.", "仅供参考的早期指标。最终临床趋势标准仍在验证中，并将与AI解读保持分开。", "Petunjuk awal sahaja. Kriteria trend klinikal akhir masih disahkan dan akan kekal berasingan daripada tafsiran AI.", "இவை ஆரம்பக் குறியீடுகள் மட்டுமே. இறுதி மருத்துவப் போக்கு அளவுகோல்கள் இன்னும் சரிபார்க்கப்படுகின்றன; அவை AI விளக்கத்திலிருந்து தனியாகவே இருக்கும்."],
  ["Building your movement baseline", "正在建立您的动作基准", "Membina garis asas pergerakan anda", "உங்கள் இயக்க அடிப்படை அளவு உருவாக்கப்படுகிறது"],
  ["Complete a few guided sessions and pain check-ins to make this trend more meaningful.", "完成几次指导训练和疼痛检查，让这项趋势更有参考意义。", "Lengkapkan beberapa sesi berpandu dan pemeriksaan kesakitan supaya trend ini lebih bermakna.", "இந்தப் போக்கு பயனுள்ளதாக இருக்க சில வழிகாட்டப்பட்ட அமர்வுகளையும் வலி சோதனைகளையும் முடிக்கவும்."],
  ["Steady", "稳定", "Stabil", "நிலையாக உள்ளது"],
  ["Improving", "正在改善", "Bertambah baik", "மேம்பட்டு வருகிறது"],
  ["Review suggested", "建议复查", "Semakan disyorkan", "மதிப்பாய்வு பரிந்துரைக்கப்படுகிறது"],
  ["Your recent pattern may need a review", "您近期的情况可能需要复查", "Corak terkini anda mungkin perlu disemak", "உங்கள் சமீபத்திய நிலைக்கு மதிப்பாய்வு தேவைப்படலாம்"],
  ["Your recent pain or recovery check-ins are moving in an unfavourable direction.", "您近期的疼痛或恢复检查呈不利趋势。", "Pemeriksaan kesakitan atau pemulihan terkini anda menunjukkan arah yang kurang baik.", "உங்கள் சமீபத்திய வலி அல்லது மீட்பு சோதனைகள் சாதகமற்ற திசையில் செல்கின்றன."],
  ["Your recent measured movement-quality scores have decreased across several sessions.", "您近期测量的动作质量评分在多次训练中有所下降。", "Skor kualiti pergerakan yang diukur baru-baru ini telah menurun dalam beberapa sesi.", "சமீபத்திய பல அமர்வுகளில் அளவிடப்பட்ட உங்கள் இயக்கத் தர மதிப்பெண்கள் குறைந்துள்ளன."],
  ["Your recent movement trend is improving", "您近期的动作趋势正在改善", "Trend pergerakan terkini anda bertambah baik", "உங்கள் சமீபத்திய இயக்கப் போக்கு மேம்பட்டு வருகிறது"],
  ["Your recent movement trend is steady", "您近期的动作趋势稳定", "Trend pergerakan terkini anda stabil", "உங்கள் சமீபத்திய இயக்கப் போக்கு நிலையாக உள்ளது"],
  ["Keep following your current plan and continue recording pain before and after exercise.", "请继续遵循当前计划，并记录运动前后的疼痛情况。", "Teruskan mengikuti pelan semasa dan merekodkan kesakitan sebelum dan selepas senaman.", "தற்போதைய திட்டத்தைத் தொடர்ந்து பின்பற்றி, உடற்பயிற்சிக்கு முன்னும் பின்னும் வலியைப் பதிவு செய்யவும்."],
  ["AI-supported trend check", "AI辅助趋势检查", "Semakan trend dibantu AI", "AI உதவியுடன் போக்கு சோதனை"],
  ["A physiotherapist review is suggested", "建议由物理治疗师复查", "Semakan ahli fisioterapi disyorkan", "உடற்பயிற்சி சிகிச்சையாளர் மதிப்பாய்வு பரிந்துரைக்கப்படுகிறது"],
  ["This is a trend prompt, not a diagnosis. You decide whether to request a consultation.", "这是趋势提示，并非诊断。是否请求咨询由您决定。", "Ini ialah peringatan trend, bukan diagnosis. Anda menentukan sama ada mahu meminta konsultasi.", "இது போக்குச் சுட்டுரை மட்டுமே; நோய் கண்டறிதல் அல்ல. ஆலோசனை கோர வேண்டுமா என்பதை நீங்கள் தீர்மானிக்கலாம்."],
  ["Choose a preferred time. The request must be accepted before it is confirmed.", "请选择方便的时间。请求须被接受后才算确认。", "Pilih masa pilihan. Permintaan mesti diterima sebelum disahkan.", "விருப்பமான நேரத்தைத் தேர்ந்தெடுக்கவும். கோரிக்கை உறுதிப்படுத்தப்படுவதற்கு முன் ஏற்கப்பட வேண்டும்."],
  ["Physiotherapist support", "物理治疗师支持", "Sokongan ahli fisioterapi", "உடற்பயிற்சி சிகிச்சையாளர் ஆதரவு"],
  ["Talk to a professional whenever you choose.", "您可以随时与专业人员沟通。", "Berbincang dengan profesional pada bila-bila masa yang anda pilih.", "நீங்கள் விரும்பும் நேரத்தில் நிபுணருடன் பேசலாம்."],
  ["Booking is always available—you do not need to wait for a warning from the AI.", "您随时都可以预约——无需等待AI发出警示。", "Tempahan sentiasa tersedia—anda tidak perlu menunggu amaran daripada AI.", "முன்பதிவு எப்போதும் கிடைக்கும்—AI எச்சரிக்கைக்காக நீங்கள் காத்திருக்க வேண்டியதில்லை."],
  ["Book a consultation", "预约咨询", "Tempah konsultasi", "ஆலோசனையை முன்பதிவு செய்யவும்"],
  ["Consultation", "咨询", "Konsultasi", "ஆலோசனை"],
  ["Request consultation", "请求咨询", "Minta konsultasi", "ஆலோசனையைக் கோரவும்"],
  ["No consultation currently scheduled.", "目前没有已安排的咨询。", "Tiada konsultasi yang dijadualkan buat masa ini.", "தற்போது ஆலோசனை எதுவும் திட்டமிடப்படவில்லை."],
  ["Send your recent movement and pain history to the care team. A physiotherapist will pick up your case and take over your plan.", "将您近期的动作和疼痛记录发送给护理团队。物理治疗师将接手您的个案和计划。", "Hantar sejarah pergerakan dan kesakitan terkini anda kepada pasukan penjagaan. Seorang ahli fisioterapi akan mengambil kes anda dan mengurus pelan anda.", "உங்கள் சமீபத்திய இயக்க மற்றும் வலி வரலாற்றைப் பராமரிப்புக் குழுவிற்கு அனுப்பவும். ஒரு உடற்பயிற்சி சிகிச்சையாளர் உங்கள் வழக்கையும் திட்டத்தையும் ஏற்றுக்கொள்வார்."],
  ["Set up your patient home", "设置您的患者主页", "Sediakan halaman pesakit anda", "உங்கள் நோயாளர் முகப்பை அமைக்கவும்"],
  ["Which type of exercise support are you using?", "您正在使用哪种运动支持？", "Apakah jenis sokongan senaman yang anda gunakan?", "நீங்கள் எந்த வகையான உடற்பயிற்சி ஆதரவைப் பயன்படுத்துகிறீர்கள்?"],
  ["Choose the option that matches your current situation. This controls which exercises and AI functions are available.", "请选择符合您当前情况的选项。这将决定可用的运动和AI功能。", "Pilih pilihan yang sepadan dengan keadaan semasa anda. Ini menentukan senaman dan fungsi AI yang tersedia.", "உங்கள் தற்போதைய நிலைக்கு ஏற்ற விருப்பத்தைத் தேர்ந்தெடுக்கவும். எந்தப் பயிற்சிகளும் AI அம்சங்களும் கிடைக்கும் என்பதை இது தீர்மானிக்கும்."],
  ["I have a physiotherapist-assigned plan", "我有物理治疗师指定的计划", "Saya mempunyai pelan yang ditetapkan oleh ahli fisioterapi", "எனக்கு உடற்பயிற்சி சிகிச்சையாளர் வழங்கிய திட்டம் உள்ளது"],
  ["I have a medical condition, injury or post-operative plan. Show only movements approved for my physiotherapy pathway.", "我有疾病、受伤或术后计划。仅显示获准用于我物理治疗路径的动作。", "Saya mempunyai keadaan perubatan, kecederaan atau pelan selepas pembedahan. Tunjukkan hanya pergerakan yang diluluskan untuk laluan fisioterapi saya.", "எனக்கு மருத்துவ நிலை, காயம் அல்லது அறுவைசிகிச்சைக்குப் பிந்தைய திட்டம் உள்ளது. எனது உடற்பயிற்சி சிகிச்சைப் பாதைக்கு அனுமதிக்கப்பட்ட இயக்கங்களை மட்டும் காட்டவும்."],
  ["I am here for general wellness", "我是为了日常健康而来", "Saya di sini untuk kesejahteraan umum", "நான் பொது நலவாழ்வுக்காக வந்துள்ளேன்"],
  ["I do not have a diagnosed condition or physiotherapist restriction. Let the AI companion help me create a conservative wellness plan after the safety screen.", "我没有确诊疾病或物理治疗师限制。安全筛查后，让AI伙伴协助我制定保守的健康计划。", "Saya tidak mempunyai keadaan yang didiagnosis atau sekatan ahli fisioterapi. Selepas saringan keselamatan, biarkan pembantu AI membantu saya mencipta pelan kesejahteraan yang berhati-hati.", "எனக்கு நோய் கண்டறிதல் அல்லது உடற்பயிற்சி சிகிச்சையாளர் கட்டுப்பாடு இல்லை. பாதுகாப்புச் சோதனைக்குப் பிறகு பாதுகாப்பான நலவாழ்வுத் திட்டத்தை உருவாக்க AI துணை உதவட்டும்."],
  ["Connect to your physiotherapist", "连接您的物理治疗师", "Sambung kepada ahli fisioterapi anda", "உங்கள் உடற்பயிற்சி சிகிச்சையாளருடன் இணைக்கவும்"],
  ["Enter the one-time invitation code supplied by the physiotherapist who will manage your programme.", "请输入将管理您计划的物理治疗师所提供的一次性邀请码。", "Masukkan kod jemputan sekali guna yang diberikan oleh ahli fisioterapi yang akan mengurus program anda.", "உங்கள் திட்டத்தை நிர்வகிக்கும் உடற்பயிற்சி சிகிச்சையாளர் வழங்கிய ஒருமுறை அழைப்புக் குறியீட்டை உள்ளிடவும்."],
  ["8-character invitation code", "8位邀请码", "Kod jemputan 8 aksara", "8 எழுத்து அழைப்புக் குறியீடு"],
  ["Connect and continue", "连接并继续", "Sambung dan teruskan", "இணைத்து தொடரவும்"],
  ["Don't have a code?", "没有邀请码？", "Tiada kod?", "குறியீடு இல்லையா?"],
  ["— we'll add you to the triage queue for the care team to pick up.", "——我们会将您加入分诊队列，等待护理团队接手。", "— kami akan menambah anda ke barisan triage untuk diambil oleh pasukan penjagaan.", "— பராமரிப்புக் குழு கவனிக்க உங்களை முன்னுரிமை மதிப்பீட்டு வரிசையில் சேர்ப்போம்."],
  ["This choice is not a diagnosis. If you have a condition, recent surgery, concerning symptoms or clinician restrictions, choose the physiotherapist-assigned pathway.", "此选择并非诊断。如果您有疾病、近期手术、令人担忧的症状或临床限制，请选择物理治疗师指定的路径。", "Pilihan ini bukan diagnosis. Jika anda mempunyai keadaan, pembedahan baru-baru ini, gejala yang membimbangkan atau sekatan klinisian, pilih laluan yang ditetapkan ahli fisioterapi.", "இந்தத் தேர்வு நோய் கண்டறிதல் அல்ல. உங்களுக்கு மருத்துவ நிலை, சமீபத்திய அறுவைசிகிச்சை, கவலைக்குரிய அறிகுறிகள் அல்லது மருத்துவர் கட்டுப்பாடுகள் இருந்தால், உடற்பயிற்சி சிகிச்சையாளர் வழங்கிய பாதையைத் தேர்ந்தெடுக்கவும்."],
  ["Review needed", "需要复查", "Semakan diperlukan", "மதிப்பாய்வு தேவை"],
  ["No plan yet", "还没有计划", "Belum ada pelan", "இன்னும் திட்டம் இல்லை"],
  ["No self-guided plan has been created. Review your safety-screen answers before using general-wellness exercises.", "尚未建立自助指导计划。使用一般健康运动前，请复查您的安全筛查答案。", "Belum ada pelan kendiri yang dicipta. Semak jawapan saringan keselamatan anda sebelum menggunakan senaman kesejahteraan umum.", "சுய வழிகாட்டல் திட்டம் இன்னும் உருவாக்கப்படவில்லை. பொது நலவாழ்வுப் பயிற்சிகளைப் பயன்படுத்தும் முன் உங்கள் பாதுகாப்புச் சோதனைப் பதில்களை மதிப்பாய்வு செய்யவும்."],
  ["No plan has been created yet. Ask the AI movement companion to help you begin a personalized general-wellness plan.", "还没有建立计划。请让AI动作伙伴协助您开始个性化的一般健康计划。", "Belum ada pelan yang dicipta. Minta pembantu pergerakan AI membantu anda memulakan pelan kesejahteraan umum yang diperibadikan.", "இன்னும் திட்டம் உருவாக்கப்படவில்லை. தனிப்பயன் பொது நலவாழ்வுத் திட்டத்தைத் தொடங்க AI இயக்கத் துணையிடம் உதவி கேட்கவும்."],
  ["Review the wellness safety screen", "复查健康安全筛查", "Semak saringan keselamatan kesejahteraan", "நலவாழ்வு பாதுகாப்புச் சோதனையை மதிப்பாய்வு செய்யவும்"],
  ["Start with your AI movement companion", "从AI动作伙伴开始", "Mulakan dengan pembantu pergerakan AI anda", "உங்கள் AI இயக்கத் துணையுடன் தொடங்கவும்"],
  ["This is not a diagnosis. Self-guided exercises remain locked while an answer indicates that professional guidance may be safer.", "这不是诊断。如果答案显示专业指导可能更安全，自助指导运动将保持锁定。", "Ini bukan diagnosis. Senaman kendiri kekal dikunci apabila jawapan menunjukkan bahawa panduan profesional mungkin lebih selamat.", "இது நோய் கண்டறிதல் அல்ல. தொழில்முறை வழிகாட்டுதல் பாதுகாப்பானதாக இருக்கலாம் என ஒரு பதில் காட்டினால், சுய வழிகாட்டல் பயிற்சிகள் பூட்டப்பட்டிருக்கும்."],
  ["The AI can help clarify your goal. Exercise access is created only after the short general-wellness safety screen is eligible.", "AI可以协助厘清您的目标。只有通过简短的一般健康安全筛查后，才会开放运动访问权限。", "AI boleh membantu menjelaskan matlamat anda. Akses senaman hanya dibuka selepas saringan keselamatan kesejahteraan umum yang ringkas didapati layak.", "உங்கள் இலக்கைத் தெளிவுபடுத்த AI உதவும். குறுகிய பொது நலவாழ்வு பாதுகாப்புச் சோதனை தகுதிபெற்ற பிறகே உடற்பயிற்சி அணுகல் திறக்கப்படும்."],
  ["Review my safety screen", "复查我的安全筛查", "Semak saringan keselamatan saya", "எனது பாதுகாப்புச் சோதனையை மதிப்பாய்வு செய்யவும்"],
  ["Ask AI to create my plan", "让AI制定我的计划", "Minta AI mencipta pelan saya", "எனது திட்டத்தை உருவாக்க AI-யிடம் கேட்கவும்"],
  ["Ready for an AI draft", "可以建立AI草案", "Sedia untuk draf AI", "AI வரைவு உருவாக்கத் தயார்"],
  ["Your safety screen is eligible, but no AI plan has been accepted yet.", "您的安全筛查已符合条件，但还没有接受任何AI计划。", "Saringan keselamatan anda layak, tetapi belum ada pelan AI yang diterima.", "உங்கள் பாதுகாப்புச் சோதனை தகுதிபெற்றுள்ளது; ஆனால் AI திட்டம் இன்னும் ஏற்கப்படவில்லை."],
  ["Create and review your AI plan", "建立并查看您的AI计划", "Cipta dan semak pelan AI anda", "உங்கள் AI திட்டத்தை உருவாக்கி மதிப்பாய்வு செய்யவும்"],
  ["Answer the short planning interview, review why each session was chosen, and accept the draft before exercises unlock.", "完成简短的计划问答，查看选择每次训练的原因，并在运动解锁前接受草案。", "Jawab temu bual perancangan ringkas, semak sebab setiap sesi dipilih dan terima draf sebelum senaman dibuka.", "குறுகிய திட்டமிடல் கேள்விகளுக்குப் பதிலளித்து, ஒவ்வொரு அமர்வும் ஏன் தேர்ந்தெடுக்கப்பட்டது என்பதைப் பார்த்து, பயிற்சிகள் திறக்கும்முன் வரைவை ஏற்கவும்."],
  ["Passing the safety screen alone never assigns exercises.", "仅通过安全筛查不会自动指定运动。", "Lulus saringan keselamatan sahaja tidak akan menetapkan senaman.", "பாதுகாப்புச் சோதனையில் தேர்ச்சி பெறுவது மட்டும் பயிற்சிகளை ஒதுக்காது."],
  ["Create my plan with AI", "用AI制定我的计划", "Cipta pelan saya dengan AI", "AI மூலம் எனது திட்டத்தை உருவாக்கவும்"],
  ["Plan refresh needed", "需要更新计划", "Pelan perlu diperbaharui", "திட்டத்தைப் புதுப்பிக்க வேண்டும்"],
  ["Your saved AI plan contains an exercise that now requires physiotherapist approval.", "您保存的AI计划中有一项运动现在需要物理治疗师批准。", "Pelan AI yang disimpan mengandungi senaman yang kini memerlukan kelulusan ahli fisioterapi.", "நீங்கள் சேமித்த AI திட்டத்தில் இப்போது உடற்பயிற்சி சிகிச்சையாளர் அனுமதி தேவைப்படும் ஒரு பயிற்சி உள்ளது."],
  ["Create a new AI wellness plan", "建立新的AI健康计划", "Cipta pelan kesejahteraan AI baharu", "புதிய AI நலவாழ்வுத் திட்டத்தை உருவாக்கவும்"],
  ["The camera remains locked for clinician-only movements. A new draft will use only exercises available to your general-wellness pathway.", "仅限临床人员批准的动作仍会锁定摄像头。新草案只会使用一般健康路径中可用的运动。", "Kamera kekal dikunci untuk pergerakan khas klinisian. Draf baharu hanya akan menggunakan senaman yang tersedia untuk laluan kesejahteraan umum anda.", "மருத்துவர் அனுமதி மட்டும் உள்ள இயக்கங்களுக்கு கேமரா பூட்டப்பட்டிருக்கும். புதிய வரைவு உங்கள் பொது நலவாழ்வுப் பாதையில் கிடைக்கும் பயிற்சிகளை மட்டுமே பயன்படுத்தும்."],
  ["Your safety-screen result is unchanged; only the incompatible saved plan needs replacing.", "您的安全筛查结果没有改变；只需替换不兼容的已保存计划。", "Keputusan saringan keselamatan anda tidak berubah; hanya pelan tersimpan yang tidak serasi perlu diganti.", "உங்கள் பாதுகாப்புச் சோதனை முடிவு மாறவில்லை; பொருந்தாத சேமித்த திட்டத்தை மட்டும் மாற்ற வேண்டும்."],
  ["Create a new AI plan", "建立新的AI计划", "Cipta pelan AI baharu", "புதிய AI திட்டத்தை உருவாக்கவும்"],
  ["Your accepted AI wellness plan uses reviewed, camera-trackable exercises.", "您接受的AI健康计划采用了已审核且可由摄像头追踪的运动。", "Pelan kesejahteraan AI yang anda terima menggunakan senaman yang telah disemak dan boleh dijejak kamera.", "நீங்கள் ஏற்ற AI நலவாழ்வுத் திட்டம் மதிப்பாய்வு செய்யப்பட்ட, கேமராவால் கண்காணிக்கக்கூடிய பயிற்சிகளைப் பயன்படுத்துகிறது."],
  ["AI draft accepted by you. Stop if you feel unwell or develop new or concerning symptoms.", "您已接受AI草案。如果感到不适或出现新的或令人担忧的症状，请停止。", "Draf AI diterima oleh anda. Berhenti jika anda berasa tidak sihat atau mengalami gejala baharu atau membimbangkan.", "AI வரைவை நீங்கள் ஏற்றுள்ளீர்கள். உடல்நலக்குறைவு அல்லது புதிய கவலைக்குரிய அறிகுறிகள் ஏற்பட்டால் நிறுத்தவும்."],
  ["Pause your wellness plan and seek professional advice", "暂停健康计划并寻求专业意见", "Jeda pelan kesejahteraan dan dapatkan nasihat profesional", "உங்கள் நலவாழ்வுத் திட்டத்தை நிறுத்தி நிபுணர் ஆலோசனையைப் பெறவும்"],
  ["This is a trend prompt, not a diagnosis. Send a consultation request if you want your physiotherapist to review this pattern.", "这是趋势提示，并非诊断。如果希望物理治疗师复查此情况，请发送咨询请求。", "Ini ialah peringatan trend, bukan diagnosis. Hantar permintaan konsultasi jika anda mahu ahli fisioterapi menyemak corak ini.", "இது போக்குச் சுட்டுரை மட்டுமே; நோய் கண்டறிதல் அல்ல. இந்த நிலையை உங்கள் உடற்பயிற்சி சிகிச்சையாளர் மதிப்பாய்வு செய்ய வேண்டுமெனில் ஆலோசனை கோரிக்கையை அனுப்பவும்."],
  ["This is a trend prompt, not a diagnosis. You can request an available PhysioVision physiotherapist; the request is not confirmed until it is accepted.", "这是趋势提示，并非诊断。您可以请求可用的PhysioVision物理治疗师；请求被接受后才算确认。", "Ini ialah peringatan trend, bukan diagnosis. Anda boleh meminta ahli fisioterapi PhysioVision yang tersedia; permintaan belum disahkan sehingga diterima.", "இது போக்குச் சுட்டுரை மட்டுமே; நோய் கண்டறிதல் அல்ல. கிடைக்கும் PhysioVision உடற்பயிற்சி சிகிச்சையாளரை நீங்கள் கோரலாம்; கோரிக்கை ஏற்கப்படும் வரை உறுதியாகாது."],
  ["Physiotherapist confirmed", "物理治疗师已确认", "Ahli fisioterapi telah mengesahkan", "உடற்பயிற்சி சிகிச்சையாளர் உறுதிசெய்தார்"],
  ["Review already requested", "已请求复查", "Semakan telah diminta", "மதிப்பாய்வு ஏற்கனவே கோரப்பட்டுள்ளது"],
  ["Ask my physiotherapist to review", "请我的物理治疗师复查", "Minta ahli fisioterapi saya menyemak", "எனது உடற்பயிற்சி சிகிச்சையாளரை மதிப்பாய்வு செய்யக் கேட்கவும்"],
  ["Choose a preferred time for your existing physiotherapist to review this pattern.", "请选择方便的时间，让您现有的物理治疗师复查此情况。", "Pilih masa pilihan untuk ahli fisioterapi sedia ada anda menyemak corak ini.", "இந்த நிலையை உங்கள் தற்போதைய உடற்பயிற்சி சிகிச்சையாளர் மதிப்பாய்வு செய்ய விருப்பமான நேரத்தைத் தேர்ந்தெடுக்கவும்."],
  ["Your physiotherapist suggested a consultation", "您的物理治疗师建议进行咨询", "Ahli fisioterapi anda mencadangkan konsultasi", "உங்கள் உடற்பயிற்சி சிகிச்சையாளர் ஆலோசனையைப் பரிந்துரைத்தார்"],
  ["Accept", "接受", "Terima", "ஏற்கவும்"],
  ["Propose new time", "建议新时间", "Cadangkan masa baharu", "புதிய நேரத்தை முன்மொழியவும்"],
  ["Decline", "拒绝", "Tolak", "மறுக்கவும்"],
  ["You", "您", "Anda", "நீங்கள்"],
  ["Physiotherapist", "物理治疗师", "Ahli fisioterapi", "உடற்பயிற்சி சிகிச்சையாளர்"],
  ["Could not load messages.", "无法加载信息。", "Mesej tidak dapat dimuatkan.", "செய்திகளை ஏற்ற முடியவில்லை."],
  ["No messages yet. Say hello or ask a question.", "还没有信息。您可以打招呼或提出问题。", "Belum ada mesej. Ucap helo atau tanya soalan.", "இன்னும் செய்திகள் இல்லை. வணக்கம் கூறுங்கள் அல்லது கேள்வி கேளுங்கள்."],
  ["Your message could not be sent.", "无法发送您的信息。", "Mesej anda tidak dapat dihantar.", "உங்கள் செய்தியை அனுப்ப முடியவில்லை."],
  ["Consultation requested", "已请求咨询", "Konsultasi diminta", "ஆலோசனை கோரப்பட்டது"],
  ["Sending your request…", "正在发送请求……", "Menghantar permintaan anda…", "உங்கள் கோரிக்கை அனுப்பப்படுகிறது…"],
  ["Request sent. The physiotherapist will confirm the appointment.", "请求已发送。物理治疗师将确认预约。", "Permintaan dihantar. Ahli fisioterapi akan mengesahkan janji temu.", "கோரிக்கை அனுப்பப்பட்டது. உடற்பயிற்சி சிகிச்சையாளர் சந்திப்பை உறுதிசெய்வார்."],
  ["The consultation request could not be sent.", "无法发送咨询请求。", "Permintaan konsultasi tidak dapat dihantar.", "ஆலோசனை கோரிக்கையை அனுப்ப முடியவில்லை."],
  ["Choose a preferred time, then send the request for review.", "请选择方便的时间，然后发送复查请求。", "Pilih masa pilihan, kemudian hantar permintaan untuk semakan.", "விருப்பமான நேரத்தைத் தேர்ந்தெடுத்து, மதிப்பாய்வு கோரிக்கையை அனுப்பவும்."],
  ["Saving your pathway…", "正在保存您的路径……", "Menyimpan laluan anda…", "உங்கள் பாதை சேமிக்கப்படுகிறது…"],
  ["Your pathway could not be saved. Please try again.", "无法保存您的路径。请重试。", "Laluan anda tidak dapat disimpan. Sila cuba lagi.", "உங்கள் பாதையைச் சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."],
  ["Enter the complete 8-character invitation code.", "请输入完整的8位邀请码。", "Masukkan kod jemputan 8 aksara yang lengkap.", "முழுமையான 8 எழுத்து அழைப்புக் குறியீட்டை உள்ளிடவும்."],
  ["Checking invitation…", "正在检查邀请……", "Memeriksa jemputan…", "அழைப்பு சரிபார்க்கப்படுகிறது…"],
  ["The invitation could not be accepted.", "无法接受邀请。", "Jemputan tidak dapat diterima.", "அழைப்பை ஏற்க முடியவில்லை."],
  ["Adding you to the triage queue…", "正在将您加入分诊队列……", "Menambah anda ke barisan triage…", "முன்னுரிமை மதிப்பீட்டு வரிசையில் நீங்கள் சேர்க்கப்படுகிறீர்கள்…"],
  ["Request received. A physiotherapist will pick up your case soon.", "已收到请求。物理治疗师将很快接手您的个案。", "Permintaan diterima. Seorang ahli fisioterapi akan mengambil kes anda tidak lama lagi.", "கோரிக்கை பெறப்பட்டது. ஒரு உடற்பயிற்சி சிகிச்சையாளர் விரைவில் உங்கள் வழக்கை ஏற்றுக்கொள்வார்."],
  ["Request sent. A physiotherapist will pick up your case soon.", "请求已发送。物理治疗师将很快接手您的个案。", "Permintaan dihantar. Seorang ahli fisioterapi akan mengambil kes anda tidak lama lagi.", "கோரிக்கை அனுப்பப்பட்டது. ஒரு உடற்பயிற்சி சிகிச்சையாளர் விரைவில் உங்கள் வழக்கை ஏற்றுக்கொள்வார்."],
  ["Physiotherapist request pending", "物理治疗师请求待处理", "Permintaan ahli fisioterapi sedang menunggu", "உடற்பயிற்சி சிகிச்சையாளர் கோரிக்கை நிலுவையில் உள்ளது"],
  ["Your wellness plan stays active while a physiotherapist reviews your request.", "物理治疗师审核您的请求期间，您的健康计划仍可继续使用。", "Pelan kesejahteraan anda kekal aktif sementara ahli fisioterapi menyemak permintaan anda.", "உடற்பயிற்சி சிகிச்சையாளர் உங்கள் கோரிக்கையை மதிப்பாய்வு செய்யும் போது உங்கள் நலவாழ்வுத் திட்டம் தொடர்ந்து செயலில் இருக்கும்."],
  ["Request pending", "请求待处理", "Permintaan menunggu", "கோரிக்கை நிலுவையில் உள்ளது"],
  ["Request a consultation with a physiotherapist.", "请求与物理治疗师咨询。", "Minta konsultasi dengan ahli fisioterapi.", "உடற்பயிற்சி சிகிச்சையாளருடன் ஆலோசனை கோரவும்."],
  ["Tell your physiotherapist what you would like to discuss. They will propose the appointment date, time and duration.", "告诉物理治疗师您想讨论的事项。物理治疗师将提出预约日期、时间和时长。", "Beritahu ahli fisioterapi perkara yang ingin anda bincangkan. Mereka akan mencadangkan tarikh, masa dan tempoh janji temu.", "நீங்கள் விவாதிக்க விரும்புவதை உடற்பயிற்சி சிகிச்சையாளரிடம் தெரிவிக்கவும். சந்திப்பு தேதி, நேரம் மற்றும் கால அளவை அவர் முன்மொழிவார்."],
  ["This sends a request only. Your physiotherapist will propose an appointment time for you to accept. This is not an emergency service.", "这只会发送请求。您的物理治疗师会提出一个预约时间，供您接受。这不是紧急服务。", "Ini hanya menghantar permintaan. Ahli fisioterapi anda akan mencadangkan masa janji temu untuk anda terima. Ini bukan perkhidmatan kecemasan.", "இது கோரிக்கையை மட்டுமே அனுப்பும். நீங்கள் ஏற்க ஒரு சந்திப்பு நேரத்தை உங்கள் உடற்பயிற்சி சிகிச்சையாளர் முன்மொழிவார். இது அவசர சேவை அல்ல."],
  ["Request sent. Your physiotherapist will propose an appointment time.", "请求已发送。您的物理治疗师会提出预约时间。", "Permintaan dihantar. Ahli fisioterapi anda akan mencadangkan masa janji temu.", "கோரிக்கை அனுப்பப்பட்டது. உங்கள் உடற்பயிற்சி சிகிச்சையாளர் சந்திப்பு நேரத்தை முன்மொழிவார்."],
  ["Add what you would like reviewed, then send the request.", "填写您希望复查的事项，然后发送请求。", "Tambahkan perkara yang ingin anda semak, kemudian hantar permintaan.", "நீங்கள் மதிப்பாய்வு செய்ய விரும்புவதைச் சேர்த்து, பின்னர் கோரிக்கையை அனுப்பவும்."],
  ["Your physiotherapist will propose the appointment time.", "您的物理治疗师会提出预约时间。", "Ahli fisioterapi anda akan mencadangkan masa janji temu.", "உங்கள் உடற்பயிற்சி சிகிச்சையாளர் சந்திப்பு நேரத்தை முன்மொழிவார்."],
  ["Tell your physiotherapist what you would like reviewed. They will propose the appointment time.", "告诉您的物理治疗师您希望复查的事项。他们会提出预约时间。", "Beritahu ahli fisioterapi anda perkara yang ingin disemak. Mereka akan mencadangkan masa janji temu.", "நீங்கள் மதிப்பாய்வு செய்ய விரும்புவதை உங்கள் உடற்பயிற்சி சிகிச்சையாளரிடம் தெரிவிக்கவும். அவர் சந்திப்பு நேரத்தை முன்மொழிவார்."],
  ["Tell a physiotherapist what you would like reviewed. They will propose the appointment time.", "告诉物理治疗师您希望复查的事项。他们会提出预约时间。", "Beritahu ahli fisioterapi perkara yang ingin disemak. Mereka akan mencadangkan masa janji temu.", "நீங்கள் மதிப்பாய்வு செய்ய விரும்புவதை ஒரு உடற்பயிற்சி சிகிச்சையாளரிடம் தெரிவிக்கவும். அவர் சந்திப்பு நேரத்தை முன்மொழிவார்."],
  ["Your physiotherapist", "您的物理治疗师", "Ahli fisioterapi anda", "உங்கள் உடற்பயிற்சி சிகிச்சையாளர்"],
  ["will propose an appointment time.", "会提出预约时间。", "akan mencadangkan masa janji temu.", "சந்திப்பு நேரத்தை முன்மொழிவார்."],
  ["Waiting for a physiotherapist to accept your request.", "正在等待物理治疗师接受您的请求。", "Menunggu ahli fisioterapi menerima permintaan anda.", "உடற்பயிற்சி சிகிச்சையாளர் உங்கள் கோரிக்கையை ஏற்கக் காத்திருக்கிறது."],
  ["Request a physiotherapist? Your wellness plan will stay active while the care team reviews your request.", "请求物理治疗师吗？护理团队审核您的请求期间，您的健康计划仍可继续使用。", "Minta ahli fisioterapi? Pelan kesejahteraan anda akan kekal aktif sementara pasukan penjagaan menyemak permintaan anda.", "உடற்பயிற்சி சிகிச்சையாளரைக் கோரவா? பராமரிப்புக் குழு உங்கள் கோரிக்கையை மதிப்பாய்வு செய்யும் போது உங்கள் நலவாழ்வுத் திட்டம் தொடர்ந்து செயலில் இருக்கும்."],
  ["Your request could not be sent. Please try again.", "无法发送您的请求。请重试。", "Permintaan anda tidak dapat dihantar. Sila cuba lagi.", "உங்கள் கோரிக்கையை அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்."],
  ["Request a physiotherapist? This pauses your self-guided wellness plan and shares your recent history with the care team.", "请求物理治疗师吗？这将暂停您的自助健康计划，并与护理团队分享您近期的记录。", "Minta ahli fisioterapi? Ini menjeda pelan kesejahteraan kendiri anda dan berkongsi sejarah terkini anda dengan pasukan penjagaan.", "உடற்பயிற்சி சிகிச்சையாளரைக் கோரவா? இது உங்கள் சுய வழிகாட்டல் நலவாழ்வுத் திட்டத்தை நிறுத்தி, சமீபத்திய வரலாற்றைப் பராமரிப்புக் குழுவுடன் பகிரும்."],
  ["Propose a new date & time (e.g. 2026-08-05 15:30):", "建议新的日期和时间（例如2026-08-05 15:30）：", "Cadangkan tarikh dan masa baharu (cth. 2026-08-05 15:30):", "புதிய தேதி மற்றும் நேரத்தை முன்மொழியவும் (எ.கா. 2026-08-05 15:30):"],
  ["Could not read that date/time.", "无法识别该日期或时间。", "Tarikh/masa itu tidak dapat dibaca.", "அந்த தேதி/நேரத்தைப் புரிந்துகொள்ள முடியவில்லை."],
  ["Something went wrong.", "发生错误。", "Sesuatu telah berlaku.", "ஏதோ தவறு ஏற்பட்டது."],
  ["Plan unavailable", "计划不可用", "Pelan tidak tersedia", "திட்டம் கிடைக்கவில்லை"],
  ["Your plan could not be loaded. No exercise access has been changed.", "无法加载您的计划。运动访问权限没有任何更改。", "Pelan anda tidak dapat dimuatkan. Akses senaman tidak diubah.", "உங்கள் திட்டத்தை ஏற்ற முடியவில்லை. உடற்பயிற்சி அணுகலில் மாற்றம் செய்யப்படவில்லை."],
  ["We could not reach your private plan", "无法连接到您的私人计划", "Kami tidak dapat mencapai pelan peribadi anda", "உங்கள் தனிப்பட்ட திட்டத்தை அணுக முடியவில்லை"],
  ["Check your connection and try again.", "请检查网络连接后重试。", "Semak sambungan anda dan cuba lagi.", "உங்கள் இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்."],
  ["Try loading again", "再次尝试加载", "Cuba muatkan semula", "மீண்டும் ஏற்ற முயற்சிக்கவும்"],
  ["Unavailable", "不可用", "Tidak tersedia", "கிடைக்கவில்லை"],
  ["Your private session and pain history could not be loaded.", "无法加载您的私人训练和疼痛记录。", "Sesi peribadi dan sejarah kesakitan anda tidak dapat dimuatkan.", "உங்கள் தனிப்பட்ட அமர்வு மற்றும் வலி வரலாற்றை ஏற்ற முடியவில்லை."],
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

export function resolveInitialLocale({
  storedLocale = null,
  explicitlyChosen = false,
} = {}) {
  return explicitlyChosen && SUPPORTED_CODES.has(storedLocale)
    ? storedLocale
    : "en-SG";
}

function preferredStoredLocale() {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    const explicitlyChosen = globalThis.localStorage?.getItem(
      LANGUAGE_EXPLICIT_STORAGE_KEY
    ) === "true";
    return resolveInitialLocale({ storedLocale: stored, explicitlyChosen });
  } catch (_) {
    // Storage can be unavailable in private browsing; keep the page usable.
    return "en-SG";
  }
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
  // Plans are stored as structured English data. Translate each segment when
  // the dashboard joins exercise names and a duration with middle dots.
  if (text.includes(" · ")) {
    let changed = false;
    const translatedParts = text.split(" · ").map((part) => {
      const direct = TRANSLATIONS[locale]?.get(part);
      if (direct) {
        changed = true;
        return direct;
      }
      const duration = part.match(/^(\d+) min$/);
      if (!duration) return part;
      changed = true;
      const [, minutes] = duration;
      return {
        "zh-SG": `${minutes}分钟`,
        "ms-SG": `${minutes} minit`,
        "ta-SG": `${minutes} நிமிடம்`,
      }[locale] ?? part;
    });
    if (changed) return translatedParts.join(" · ");
  }

  const templates = {
    "zh-SG": [
      [/^(\d+) min$/, (_, minutes) => `${minutes}分钟`],
      [/^Session (\d+)$/, (_, session) => `第${session}次训练`],
      [/^A gentle (\d+)-day balance and lower-body stability routine designed for (.+) using a chair for support\.$/, (_, days, name) => `为${name}设计的温和${days}天平衡与下肢稳定训练，并使用椅子辅助。`],
      [/^A gradual plan focused on (.+)\.$/, (_, goal) => `一个循序渐进、以${TRANSLATIONS[locale]?.get(goal) ?? goal}为重点的计划。`],
      [/^A cautious starting plan focused on (.+)\.$/, (_, goal) => `一个谨慎起步、以${TRANSLATIONS[locale]?.get(goal) ?? goal}为重点的计划。`],
      [/^Pain level (\d+) out of 10$/, (_, level) => `疼痛程度为10分中的${level}分`],
      [/^Pain level (\d+) recorded$/, (_, level) => `疼痛程度${level}已记录`],
      [/^I heard that your pain is (\d+) out of 10\. Is that correct\?$/, (_, level) => `我听到您的疼痛程度是10分中的${level}分。正确吗？`],
      [/^I heard that your pain is now (\d+) out of 10\. Before it was (\d+)\. Is that correct\?$/, (_, level, before) => `我听到您现在的疼痛程度是10分中的${level}分，之前是${before}分。正确吗？`],
      [/^Thank you\. I have recorded your pain level as (\d+) out of 10\.$/, (_, level) => `谢谢。我已记录您的疼痛程度为10分中的${level}分。`],
      [/^Exercise (\d+) of (\d+)$/, (_, current, total) => `第${current}项运动，共${total}项`],
      [/^Detailed plan assigned by (.+)\. Follow these doses and notes exactly\.$/, (_, clinician) => `详细计划由${clinician}指定。请严格遵循这些剂量和备注。`],
      [/^(\d+) sets × (\d+) reps(?: · hold (\d+)s)? · (.+) days\/week$/, (_, sets, reps, hold, days) => `${sets}组 × ${reps}次${hold ? ` · 保持${hold}秒` : ""} · ${days === "daily" ? "每天" : `每周${days}天`}`],
      [/^Session (\d+): (\d+) out of 100$/, (_, session, score) => `第${session}次训练：100分中的${score}分`],
      [/^Movement-quality scores from oldest to newest: (.+)$/, (_, scores) => `动作质量评分（从最早到最新）：${scores}`],
      [/^(Confirmed|Requested): (.+) with (.+)\.$/, (_, status, when, clinician) => `${status === "Confirmed" ? "已确认" : "已请求"}：${when}，与${clinician}。`],
    ],
    "ms-SG": [
      [/^(\d+) min$/, (_, minutes) => `${minutes} minit`],
      [/^Session (\d+)$/, (_, session) => `Sesi ${session}`],
      [/^A gentle (\d+)-day balance and lower-body stability routine designed for (.+) using a chair for support\.$/, (_, days, name) => `Rutin keseimbangan dan kestabilan bahagian bawah badan selama ${days} hari yang lembut, direka untuk ${name} dengan sokongan kerusi.`],
      [/^A gradual plan focused on (.+)\.$/, (_, goal) => `Pelan beransur-ansur yang memberi tumpuan kepada ${TRANSLATIONS[locale]?.get(goal) ?? goal}.`],
      [/^A cautious starting plan focused on (.+)\.$/, (_, goal) => `Pelan permulaan yang berhati-hati dan memberi tumpuan kepada ${TRANSLATIONS[locale]?.get(goal) ?? goal}.`],
      [/^Pain level (\d+) out of 10$/, (_, level) => `Tahap kesakitan ${level} daripada 10`],
      [/^Pain level (\d+) recorded$/, (_, level) => `Tahap kesakitan ${level} direkodkan`],
      [/^I heard that your pain is (\d+) out of 10\. Is that correct\?$/, (_, level) => `Saya mendengar tahap kesakitan anda ialah ${level} daripada 10. Adakah itu betul?`],
      [/^I heard that your pain is now (\d+) out of 10\. Before it was (\d+)\. Is that correct\?$/, (_, level, before) => `Saya mendengar tahap kesakitan anda sekarang ialah ${level} daripada 10. Sebelum ini ${before}. Adakah itu betul?`],
      [/^Thank you\. I have recorded your pain level as (\d+) out of 10\.$/, (_, level) => `Terima kasih. Saya telah merekodkan tahap kesakitan anda sebagai ${level} daripada 10.`],
      [/^Exercise (\d+) of (\d+)$/, (_, current, total) => `Senaman ${current} daripada ${total}`],
      [/^Detailed plan assigned by (.+)\. Follow these doses and notes exactly\.$/, (_, clinician) => `Pelan terperinci ditetapkan oleh ${clinician}. Ikuti dos dan nota ini dengan tepat.`],
      [/^(\d+) sets × (\d+) reps(?: · hold (\d+)s)? · (.+) days\/week$/, (_, sets, reps, hold, days) => `${sets} set × ${reps} ulangan${hold ? ` · tahan ${hold} saat` : ""} · ${days === "daily" ? "setiap hari" : `${days} hari/minggu`}`],
      [/^Session (\d+): (\d+) out of 100$/, (_, session, score) => `Sesi ${session}: ${score} daripada 100`],
      [/^Movement-quality scores from oldest to newest: (.+)$/, (_, scores) => `Skor kualiti pergerakan daripada paling lama hingga terkini: ${scores}`],
      [/^(Confirmed|Requested): (.+) with (.+)\.$/, (_, status, when, clinician) => `${status === "Confirmed" ? "Disahkan" : "Diminta"}: ${when} bersama ${clinician}.`],
    ],
    "ta-SG": [
      [/^(\d+) min$/, (_, minutes) => `${minutes} நிமிடம்`],
      [/^Session (\d+)$/, (_, session) => `அமர்வு ${session}`],
      [/^A gentle (\d+)-day balance and lower-body stability routine designed for (.+) using a chair for support\.$/, (_, days, name) => `${name}-க்காக வடிவமைக்கப்பட்ட, நாற்காலி ஆதரவுடன் செய்யும் மென்மையான ${days} நாள் சமநிலை மற்றும் கீழ் உடல் நிலைத்தன்மைப் பயிற்சி.`],
      [/^A gradual plan focused on (.+)\.$/, (_, goal) => `${TRANSLATIONS[locale]?.get(goal) ?? goal} மீது கவனம் செலுத்தும் படிப்படியான திட்டம்.`],
      [/^A cautious starting plan focused on (.+)\.$/, (_, goal) => `${TRANSLATIONS[locale]?.get(goal) ?? goal} மீது கவனம் செலுத்தும் எச்சரிக்கையான தொடக்கத் திட்டம்.`],
      [/^Pain level (\d+) out of 10$/, (_, level) => `வலி அளவு 10-இல் ${level}`],
      [/^Pain level (\d+) recorded$/, (_, level) => `வலி அளவு ${level} பதிவு செய்யப்பட்டது`],
      [/^I heard that your pain is (\d+) out of 10\. Is that correct\?$/, (_, level) => `உங்கள் வலி அளவு 10-இல் ${level} என்று கேட்டேன். அது சரியா?`],
      [/^I heard that your pain is now (\d+) out of 10\. Before it was (\d+)\. Is that correct\?$/, (_, level, before) => `உங்கள் வலி அளவு இப்போது 10-இல் ${level} என்றும், முன்பு ${before} என்றும் கேட்டேன். அது சரியா?`],
      [/^Thank you\. I have recorded your pain level as (\d+) out of 10\.$/, (_, level) => `நன்றி. உங்கள் வலி அளவை 10-இல் ${level} எனப் பதிவு செய்துள்ளேன்.`],
      [/^Exercise (\d+) of (\d+)$/, (_, current, total) => `உடற்பயிற்சி ${current} / ${total}`],
      [/^Detailed plan assigned by (.+)\. Follow these doses and notes exactly\.$/, (_, clinician) => `${clinician} வழங்கிய விரிவான திட்டம். இந்த அளவுகளையும் குறிப்புகளையும் துல்லியமாகப் பின்பற்றவும்.`],
      [/^(\d+) sets × (\d+) reps(?: · hold (\d+)s)? · (.+) days\/week$/, (_, sets, reps, hold, days) => `${sets} சுற்றுகள் × ${reps} முறை${hold ? ` · ${hold} விநாடிகள் நிலைநிறுத்தவும்` : ""} · ${days === "daily" ? "தினமும்" : `வாரத்தில் ${days} நாட்கள்`}`],
      [/^Session (\d+): (\d+) out of 100$/, (_, session, score) => `அமர்வு ${session}: 100-இல் ${score}`],
      [/^Movement-quality scores from oldest to newest: (.+)$/, (_, scores) => `பழையதிலிருந்து புதியது வரை இயக்கத் தர மதிப்பெண்கள்: ${scores}`],
      [/^(Confirmed|Requested): (.+) with (.+)\.$/, (_, status, when, clinician) => `${status === "Confirmed" ? "உறுதிசெய்யப்பட்டது" : "கோரப்பட்டது"}: ${when}, ${clinician} உடன்.`],
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
      globalThis.localStorage?.setItem(LANGUAGE_EXPLICIT_STORAGE_KEY, "true");
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
