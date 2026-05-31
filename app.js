// ==========================================================================
// CORE APPLICATION LOGIC - DEEPSEEK V4 PRO CHAT
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // STATE VARIABLES
    // ----------------------------------------------------------------------
    let chatSessions = [];
    let activeSessionId = null;
    let isGenerating = false;
    let abortController = null;
    let thinkingTimer = null;
    let thinkingStartTime = null;
    let serverHasKey = false;
    let attachments = []; // Holds loaded files
    let memories = [];
    let memoryEnabled = true;
    const dbEndpoint = window.location.protocol === 'file:' ? 'http://localhost:3000/api/sessions' : '/api/sessions';

    // Code Space State variables
    let codespaceVariables = ['主題', '顏色'];
    let codespaceExamples = [
        {
            inputs: { '主題': '文青電子鐘', '顏色': '鼠尾草綠' },
            output: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>文青電子鐘</title>
    <style>
        body {
            background: #f5f2eb;
            color: #4a3e3d;
            font-family: 'Noto Serif TC', serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .clock-card {
            background: #faf8f5;
            border: 1px solid rgba(140, 125, 110, 0.15);
            padding: 30px 40px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(140, 125, 110, 0.05);
            text-align: center;
        }
        .time {
            font-size: 48px;
            color: #b87a6c;
            letter-spacing: 2px;
        }
    </style>
</head>
<body>
    <div class="clock-card">
        <div style="font-size: 14px; opacity: 0.6; margin-bottom: 8px;">靜止的流光</div>
        <div class="time" id="clock">00:00:00</div>
    </div>
    <script>
        function updateTime() {
            const now = new Date();
            const timeStr = now.toTimeString().split(' ')[0];
            document.getElementById('clock').textContent = timeStr;
        }
        setInterval(updateTime, 1000);
        updateTime();
    </script>
</body>
</html>`
        }
    ];

    // ----------------------------------------------------------------------
    // TOAST NOTIFICATION SYSTEM
    // ----------------------------------------------------------------------
    function showToast(title, desc, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        
        let iconLucide = 'info';
        if (type === 'success') iconLucide = 'check-circle';
        if (type === 'warning') iconLucide = 'alert-triangle';
        if (type === 'error') iconLucide = 'alert-circle';
        
        toast.innerHTML = `
            <i data-lucide="${iconLucide}" class="toast-icon ${type}"></i>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-desc">${desc}</div>
            </div>
            <div class="toast-progress"></div>
        `;
        
        container.appendChild(toast);
        lucide.createIcons();
        
        const timeout = setTimeout(() => {
            toast.classList.add('hide');
            toast.addEventListener('animationend', () => toast.remove());
        }, 4000);
        
        toast.addEventListener('click', () => {
            clearTimeout(timeout);
            toast.classList.add('hide');
            toast.addEventListener('animationend', () => toast.remove());
        });
    }
    window.showToast = showToast;

    // Config defaults
    const config = {
        apiKey: '',
        model: 'deepseek-ai/deepseek-v4-pro',
        compareModel: 'deepseek-ai/deepseek-r1',
        customModelId: '',
        connectionMode: 'proxy', // 'proxy' or 'direct'
        temperature: 0.6,
        maxTokens: 4096,
        persona: 'general',
        systemPrompt: '你是由 DeepSeek 開發並運行在 NVIDIA NIM 平台的高階推理型智能體 (DeepSeek V4 Pro)。請在回答中充分利用你的深度推理能力，提供高質量、嚴謹且符合邏輯的答覆。若被問到使用的模型，請回答是 DeepSeek-V4-Pro。'
    };

    // Voice recognition & TTS states
    let recognition = null;
    let isRecording = false;
    let activeSpeechUtterance = null;
    let activeSpeakButton = null;

    const ROLE_PROMPTS = {
        general: '你是一位充滿溫度的智慧伴侶與思緒引導者 (DeepSeek V4 Pro)。請用溫和、典雅且富有哲理的語言來解答疑惑。你的回答應如清茶般雋永，既有深度的邏輯推理，又不失人文關懷。若被問到使用的模型，請回答是 DeepSeek-V4-Pro。',
        coder: '你是一位將程式碼視為詩歌般雕琢的軟體大師。你相信優美的架構是工程與藝術的交會。請提供優雅、極簡且具備極佳可讀性的模組化程式碼，並以溫和理性的筆調分析其中的美學與優化空間。若被問到使用的模型，請回答是 DeepSeek-V4-Pro。',
        translator: '你是一位精通文字溫度與文化底蘊的跨語言對譯大師。你追求「信、雅、達」的極致境界。在翻譯時，不僅要精準轉換文字，更要傳遞文字背後含蓄的詩意與情感，並提供對照賞析。若被問到使用的模型，請回答是 DeepSeek-V4-Pro。',
        scholar: '你是一位在思想沙龍中漫步的謙遜學者與寫作顧問。你對客觀事實抱持嚴謹求實的態度，對未知則懷有敬畏之心。你的回答需結構清朗、論證扎實，如學術論文般優雅嚴謹。若被問到使用的模型，請回答是 DeepSeek-V4-Pro。'
    };

    // Phase 3 custom prompts database variables
    const DEFAULT_PROMPTS = [
        { cmd: 'explain', name: '解釋代碼', prompt: '請解釋此段代碼的運作原理與核心邏輯，分析重點著重在 {{分析重點}}：\n\n```\n\n```' },
        { cmd: 'refactor', name: '重構優化', prompt: '請重構這段代碼，特別著重於 {{優化目標}} 以提升可讀性與效能：\n\n```\n\n```' },
        { cmd: 'bug', name: '尋找Bug', prompt: '分析並找出這段代碼中潛在的 Bug 或漏洞，特別檢視 {{檢驗層面}}，並給出修復後的代碼：\n\n```\n\n```' },
        { cmd: 'translate', name: '流暢翻譯', prompt: '請將以下內容翻譯成流暢的 {{目標語言}}，保持自然且具專業感（信雅達）：\n\n' },
        { cmd: 'summary', name: '精簡摘要', prompt: '請將以下內容進行精簡摘要，以 {{呈現風格}} 呈現核心要點與結論：\n\n' }
    ];
    let customPrompts = [];
    let activePromptIndex = 0; // Tracks key navigation selection index in floating menu
    
    // Global flags for Masterpiece features
    let isCompareMode = false;
    let folders = [];

    // ----------------------------------------------------------------------
    // DOM ELEMENTS
    // ----------------------------------------------------------------------
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatSessionsList = document.getElementById('chat-sessions');
    
    // Header controls
    const headerModelSelect = document.getElementById('header-model-select');
    const statusIndicator = document.getElementById('status-indicator');
    const quickReasoning = document.getElementById('quick-reasoning');
    const quickTemp = document.getElementById('quick-temp');
    const quickTempVal = document.getElementById('quick-temp-val');
    
    // Main chat space
    const messagesContainer = document.getElementById('messages-container');
    const welcomeScreen = document.getElementById('welcome-screen');
    const apiKeyWarning = document.getElementById('api-key-warning');
    const setupKeyBtn = document.getElementById('setup-key-btn');
    const messagesList = document.getElementById('messages-list');
    
    // Bottom input
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const floatingControls = document.getElementById('floating-controls');
    
    // Settings Modal
    const settingsModal = document.getElementById('settings-modal');
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsModalBtn = document.getElementById('close-settings-modal-btn');
    const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    
    // Settings inputs
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleApiKeyBtn = document.getElementById('toggle-api-key-btn');
    const modelSelect = document.getElementById('model-select');
    const customModelItem = document.getElementById('custom-model-item');
    const customModelInput = document.getElementById('custom-model-input');
    const maxTokensInput = document.getElementById('max-tokens-input');
    const maxTokensVal = document.getElementById('max-tokens-val');
    const systemPromptInput = document.getElementById('system-prompt-input');
    
    // Footer actions
    const exportHistoryBtn = document.getElementById('export-history-btn');
    const importHistoryBtn = document.getElementById('import-history-btn');
    const importFileInput = document.getElementById('import-file-input');
    const clearAllBtn = document.getElementById('clear-all-btn');

    // Compare Mode and Folders Elements
    const compareModeBtn = document.getElementById('compare-mode-btn');
    const createFolderBtn = document.getElementById('create-folder-btn');
    const chatCanvasWrapper = document.getElementById('chat-canvas-wrapper');
    const messagesColumnLeft = document.getElementById('messages-column-left');
    const messagesColumnRight = document.getElementById('messages-column-right');
    const columnModelHeaderLeft = document.getElementById('column-model-header-left');
    const columnModelNameLeft = document.getElementById('column-model-name-left');
    const headerModelSelectCompare = document.getElementById('header-model-select-compare');
    const messagesListRight = document.getElementById('messages-list-right');
    
    // Voice Control Deck Elements
    const voiceControlDeck = document.getElementById('voice-control-deck');
    const deckPlayPauseBtn = document.getElementById('deck-play-pause-btn');
    const deckPlayIcon = document.getElementById('deck-play-icon');
    const deckStopBtn = document.getElementById('deck-stop-btn');
    const deckSpeedSlider = document.getElementById('deck-speed-slider');
    const deckSpeedVal = document.getElementById('deck-speed-val');
    const deckVoiceSelect = document.getElementById('deck-voice-select');
    const deckCloseBtn = document.getElementById('deck-close-btn');

    // ----------------------------------------------------------------------
    // INITIALIZATION
    // ----------------------------------------------------------------------
    function init() {
        loadSettings();
        loadSessionsFromStorage();
        setupEventListeners();
        renderSidebar();
        initVoiceDictation();
        initDragAndDrop();
        initTabSystem();
        initDiagnosticTool();
        initCustomPrompts();
        setupCustomPromptsListeners();
        initCodeSpace();
        
        // Initial setup for the app view
        if (chatSessions.length > 0) {
            // Load the most recent session
            const sorted = [...chatSessions].sort((a, b) => b.timestamp - a.timestamp);
            switchSession(sorted[0].id);
        } else {
            showWelcomeScreen();
        }
        
        // Initialize Lucide Icons
        lucide.createIcons();
    }

    // ----------------------------------------------------------------------
    // SETTINGS & CONFIGURATION ENGINE
    // ----------------------------------------------------------------------
    function loadSettings() {
        // Load API Key
        config.apiKey = localStorage.getItem('dsv4_api_key') || '';
        
        // Load Model
        config.model = localStorage.getItem('dsv4_model') || 'deepseek-ai/deepseek-v4-pro';
        config.compareModel = localStorage.getItem('dsv4_compare_model') || 'deepseek-ai/deepseek-r1';
        isCompareMode = localStorage.getItem('dsv4_compare_mode') === 'true';
        folders = JSON.parse(localStorage.getItem('dsv4_folders')) || [];
        config.customModelId = localStorage.getItem('dsv4_custom_model_id') || '';
        
        // Apply Compare Mode state to UI
        if (chatCanvasWrapper) {
            if (isCompareMode) {
                chatCanvasWrapper.classList.add('compare-mode-active');
                if (messagesColumnRight) messagesColumnRight.style.display = 'flex';
                if (columnModelHeaderLeft) columnModelHeaderLeft.style.display = 'flex';
                if (compareModeBtn) {
                    compareModeBtn.classList.add('active');
                    compareModeBtn.style.borderColor = 'var(--color-deepseek)';
                    compareModeBtn.style.color = 'var(--color-deepseek)';
                }
            } else {
                chatCanvasWrapper.classList.remove('compare-mode-active');
                if (messagesColumnRight) messagesColumnRight.style.display = 'none';
                if (columnModelHeaderLeft) columnModelHeaderLeft.style.display = 'none';
                if (compareModeBtn) {
                    compareModeBtn.classList.remove('active');
                    compareModeBtn.style.borderColor = '';
                    compareModeBtn.style.color = '';
                }
            }
        }
        if (headerModelSelectCompare) {
            headerModelSelectCompare.value = config.compareModel;
        }
        
        // Load Connection Mode
        config.connectionMode = localStorage.getItem('dsv4_connection_mode') || 'proxy';
        
        // Load Parameters
        const savedTemp = localStorage.getItem('dsv4_temp');
        if (savedTemp !== null) config.temperature = parseFloat(savedTemp);
        
        const savedMaxTokens = localStorage.getItem('dsv4_max_tokens');
        if (savedMaxTokens !== null) config.maxTokens = parseInt(savedMaxTokens);
        
        // Load System Prompt & Persona
        config.persona = localStorage.getItem('dsv4_persona') || 'general';
        document.getElementById('role-select').value = config.persona;
        config.systemPrompt = localStorage.getItem('dsv4_system_prompt') || config.systemPrompt;
        
        // Apply configs to DOM elements
        apiKeyInput.value = config.apiKey;
        modelSelect.value = config.model === 'deepseek-ai/deepseek-v4-pro' || 
                            config.model === 'deepseek-ai/deepseek-v4-flash' || 
                            config.model === 'deepseek-ai/deepseek-r1' ? config.model : 'custom';
        
        if (modelSelect.value === 'custom') {
            customModelItem.style.display = 'flex';
            customModelInput.value = config.model;
        } else {
            customModelItem.style.display = 'none';
        }
        
        customModelInput.value = config.customModelId;
        
        // Connection radio group
        const radioBtns = document.getElementsByName('connection-mode');
        radioBtns.forEach(btn => {
            if (btn.value === config.connectionMode) {
                btn.checked = true;
            }
        });
        
        maxTokensInput.value = config.maxTokens;
        maxTokensVal.textContent = config.maxTokens;
        
        systemPromptInput.value = config.systemPrompt;
        
        // Apply configs to Header Quick-Controls
        quickTemp.value = config.temperature;
        quickTempVal.textContent = config.temperature;
        
        // Set Model badge text in header
        updateHeaderBadge();
        updateStatusDot();

        // 1. Restore Custom Theme Visual Cards & classes
        const savedTheme = localStorage.getItem('dsv4_theme') || 'muji';
        document.body.className = '';
        document.body.classList.add(`theme-${savedTheme}`);
        const themeCards = document.querySelectorAll('.theme-card');
        themeCards.forEach(c => {
            if (c.dataset.theme === savedTheme) {
                c.classList.add('active');
            } else {
                c.classList.remove('active');
            }
        });

        // 2. Restore Font Size Slider
        const fontSizeSlider = document.getElementById('font-size-slider');
        const fontSizeVal = document.getElementById('font-size-val');
        const savedSize = localStorage.getItem('dsv4_font_size') || '15';
        if (fontSizeSlider && fontSizeVal) {
            fontSizeSlider.value = savedSize;
            fontSizeVal.textContent = `${savedSize}px`;
            document.body.style.setProperty('--app-font-size', `${savedSize}px`);
        }

        // 3. Restore Glass Blur Intensity
        const glassBlurSlider = document.getElementById('glass-blur-slider');
        const glassBlurVal = document.getElementById('glass-blur-val');
        const savedBlur = localStorage.getItem('dsv4_glass_blur') || '10';
        if (glassBlurSlider && glassBlurVal) {
            glassBlurSlider.value = savedBlur;
            glassBlurVal.textContent = `${savedBlur}px`;
            document.documentElement.style.setProperty('--glass-blur', `${savedBlur}px`);
        }

        // 4. Sync Welcome Persona chips
        const savedPersona = localStorage.getItem('dsv4_persona') || 'general';
        const matchingChip = document.querySelector(`.persona-chip[data-persona="${savedPersona}"]`);
        if (matchingChip) {
            document.querySelectorAll('.persona-chip').forEach(c => c.classList.remove('active'));
            matchingChip.classList.add('active');
        }

        // Check if server has pre-configured API Key
        const configEndpoint = window.location.protocol === 'file:' ? 'http://localhost:3000/api/config' : '/api/config';
        fetch(configEndpoint)
            .then(res => res.json())
            .then(data => {
                serverHasKey = !!data.hasApiKey;
                updateStatusDot();
                if (serverHasKey) {
                    if (apiKeyWarning) apiKeyWarning.style.display = 'none';
                    if (!config.apiKey) {
                        apiKeyInput.placeholder = '●●●●●●●●●●●●●●●● (已載入本地伺服器密鑰)';
                    }
                }
            })
            .catch(err => console.warn('[Config] Could not reach proxy config status:', err));
        
        // 5. Restore Long-term Memory states
        memories = JSON.parse(localStorage.getItem('dsv4_memories')) || [];
        memoryEnabled = localStorage.getItem('dsv4_memory_enabled') !== 'false';
        const memoryToggle = document.getElementById('memory-enabled-toggle');
        if (memoryToggle) {
            memoryToggle.checked = memoryEnabled;
        }
        renderMemoryChips();
    }

    function saveSettings() {
        // Grab values from DOM
        config.apiKey = apiKeyInput.value.trim();
        
        if (modelSelect.value === 'custom') {
            config.model = customModelInput.value.trim();
            config.customModelId = customModelInput.value.trim();
        } else {
            config.model = modelSelect.value;
        }
        
        // Connection Mode
        const radioBtns = document.getElementsByName('connection-mode');
        radioBtns.forEach(btn => {
            if (btn.checked) config.connectionMode = btn.value;
        });
        
        config.temperature = parseFloat(quickTemp.value);
        config.maxTokens = parseInt(maxTokensInput.value);
        config.systemPrompt = systemPromptInput.value.trim();
        config.persona = document.getElementById('role-select').value;
        
        // Save to LocalStorage
        localStorage.setItem('dsv4_api_key', config.apiKey);
        localStorage.setItem('dsv4_model', config.model);
        localStorage.setItem('dsv4_compare_model', config.compareModel);
        localStorage.setItem('dsv4_compare_mode', isCompareMode.toString());
        localStorage.setItem('dsv4_custom_model_id', config.customModelId);
        localStorage.setItem('dsv4_connection_mode', config.connectionMode);
        localStorage.setItem('dsv4_temp', config.temperature.toString());
        localStorage.setItem('dsv4_max_tokens', config.maxTokens.toString());
        localStorage.setItem('dsv4_system_prompt', config.systemPrompt);
        localStorage.setItem('dsv4_persona', config.persona);
        
        // Apply settings changes
        updateHeaderBadge();
        updateStatusDot();
        hideModal(settingsModal);
        
        // Show/hide API warning on welcome screen
        if (config.apiKey) {
            apiKeyWarning.style.display = 'none';
        } else {
            apiKeyWarning.style.display = 'flex';
        }

        // Save Memory enabled setting
        const memoryToggle = document.getElementById('memory-enabled-toggle');
        if (memoryToggle) {
            memoryEnabled = memoryToggle.checked;
            localStorage.setItem('dsv4_memory_enabled', memoryEnabled.toString());
        }

        showToast('設定已儲存', '系統參數與金鑰設定已成功更新！', 'success');
    }

    function updateHeaderBadge() {
        const headerModelSelect = document.getElementById('header-model-select');
        if (!headerModelSelect) return;
        
        const isStandard = config.model === 'deepseek-ai/deepseek-v4-pro' || 
                           config.model === 'deepseek-ai/deepseek-v4-flash' || 
                           config.model === 'deepseek-ai/deepseek-r1';
        
        const customOpt = document.getElementById('header-custom-option');
        if (!isStandard) {
            if (customOpt) {
                customOpt.style.display = 'block';
                let shortName = config.model;
                if (shortName.includes('/')) shortName = shortName.split('/').pop();
                customOpt.textContent = shortName;
                customOpt.value = config.model;
            }
        } else {
            if (customOpt) customOpt.style.display = 'none';
        }
        
        headerModelSelect.value = config.model;
    }

    function updateStatusDot() {
        if (config.apiKey || serverHasKey) {
            statusIndicator.className = 'status-indicator connected';
            statusIndicator.title = serverHasKey ? 'API 已連通 (已載入本地伺服器密鑰)' : 'API 已連通';
            if (apiKeyWarning) apiKeyWarning.style.display = 'none';
        } else {
            statusIndicator.className = 'status-indicator';
            statusIndicator.title = '未輸入 API 密鑰';
        }
    }

    // ----------------------------------------------------------------------
    // SESSION DATABASE / HISTORY ENGINE
    // ----------------------------------------------------------------------
    async function loadSessionsFromStorage() {
        // 1. Fast load from local localStorage as immediate load
        try {
            const raw = localStorage.getItem('dsv4_sessions');
            chatSessions = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Failed to load local chat history:', e);
            chatSessions = [];
        }
        
        renderSidebar();
        
        // 2. Asynchronous sync with server database
        try {
            const response = await fetch(dbEndpoint);
            if (response.ok) {
                const serverSessions = await response.json();
                if (Array.isArray(serverSessions) && serverSessions.length > 0) {
                    chatSessions = serverSessions;
                    saveSessionsToStorage(false); // save to localStorage silently without looping back to server POST
                    renderSidebar();
                    
                    if (activeSessionId) {
                        const exists = chatSessions.some(s => s.id === activeSessionId);
                        if (exists) {
                            switchSession(activeSessionId);
                            return;
                        }
                    }
                    
                    const sorted = [...chatSessions].sort((a, b) => b.timestamp - a.timestamp);
                    switchSession(sorted[0].id);
                }
            }
        } catch (err) {
            console.warn('[DB Sync] Failed to load sessions from server database:', err);
        }
    }

    function saveSessionsToStorage(syncToServer = true) {
        localStorage.setItem('dsv4_sessions', JSON.stringify(chatSessions));
        
        if (syncToServer) {
            fetch(dbEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(chatSessions)
            })
            .then(res => {
                if (!res.ok) {
                    console.warn('[DB Sync] Server database save request was not successful');
                }
            })
            .catch(err => {
                console.warn('[DB Sync Error] Failed to reach server to sync conversations:', err);
            });
        }
    }

    function createNewSession() {
        if (isGenerating) return;
        
        const newId = 'session_' + Date.now();
        const newSession = {
            id: newId,
            title: '全新對話',
            messages: [],
            timestamp: Date.now()
        };
        
        chatSessions.push(newSession);
        saveSessionsToStorage();
        renderSidebar();
        switchSession(newId);
        messageInput.focus();
    }

    function switchSession(id) {
        if (isGenerating && activeSessionId === id) return;
        
        activeSessionId = id;
        
        // Update sidebar visual active state
        const items = chatSessionsList.querySelectorAll('.session-item');
        items.forEach(item => {
            if (item.dataset.id === id) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Find session data
        const session = chatSessions.find(s => s.id === id);
        if (!session) {
            showWelcomeScreen();
            return;
        }
        
        // Load messages
        if (session.messages.length === 0) {
            showWelcomeScreen();
        } else {
            welcomeScreen.style.display = 'none';
            messagesList.style.display = 'flex';
            renderMessages(session.messages);
        }
    }

    function deleteSession(id, event) {
        if (event) event.stopPropagation();
        
        if (confirm('確定要刪除這筆對話紀錄嗎？')) {
            chatSessions = chatSessions.filter(s => s.id !== id);
            saveSessionsToStorage();
            renderSidebar();
            
            if (activeSessionId === id) {
                if (chatSessions.length > 0) {
                    // Switch to the first session in the list
                    switchSession(chatSessions[0].id);
                } else {
                    activeSessionId = null;
                    showWelcomeScreen();
                }
            }
        }
    }

    function editSessionTitle(id, event) {
        if (event) event.stopPropagation();
        
        const session = chatSessions.find(s => s.id === id);
        if (!session) return;
        
        const newTitle = prompt('修改對話名稱:', session.title);
        if (newTitle && newTitle.trim()) {
            session.title = newTitle.trim();
            saveSessionsToStorage();
            renderSidebar();
        }
    }

    function togglePinSession(id, event) {
        if (event) event.stopPropagation();
        const session = chatSessions.find(s => s.id === id);
        if (!session) return;
        
        session.pinned = !session.pinned;
        saveSessionsToStorage();
        renderSidebar();
        
        showToast(
            session.pinned ? '會話已釘選' : '取消釘選', 
            `會話「${session.title}」已${session.pinned ? '固定於頂端' : '恢復預設排序'}。`,
            'success'
        );
    }

    function renderSidebar() {
        chatSessionsList.innerHTML = '';
        
        const sortedSessions = [...chatSessions].sort((a, b) => b.timestamp - a.timestamp);
        const searchQuery = document.getElementById('search-input')?.value.toLowerCase() || '';
        const filteredSessions = sortedSessions.filter(s => {
            const titleMatch = s.title.toLowerCase().includes(searchQuery);
            const contentMatch = s.messages && s.messages.some(m => m.content && m.content.toLowerCase().includes(searchQuery));
            return titleMatch || contentMatch;
        });
        
        // Track which sessions have been rendered in folders
        const renderedSessionIds = new Set();
        
        // 1. Render Folders
        folders.forEach(folder => {
            // Find member sessions that are in the filtered list
            const folderSessions = filteredSessions.filter(s => folder.sessionIds.includes(s.id));
            
            // Only show folders if they have matching sessions, OR if the search query is empty (show empty folders)
            if (folderSessions.length > 0 || !searchQuery) {
                const folderEl = document.createElement('div');
                folderEl.className = `sidebar-folder ${folder.collapsed ? 'collapsed' : ''}`;
                folderEl.dataset.id = folder.id;
                
                folderEl.innerHTML = `
                    <div class="sidebar-folder-header" onclick="window.toggleFolderCollapse('${folder.id}', event)">
                        <div class="folder-title-container">
                            <i data-lucide="chevron-down" class="folder-chevron"></i>
                            <i data-lucide="${folder.collapsed ? 'folder' : 'folder-open'}" class="folder-icon"></i>
                            <span class="folder-name">${escapeHTML(folder.name)}</span>
                        </div>
                        <div class="folder-actions" onclick="event.stopPropagation()">
                            <button class="folder-action-btn" title="重新命名" onclick="window.renameFolder('${folder.id}')">
                                <i data-lucide="edit-3"></i>
                            </button>
                            <button class="folder-action-btn" title="刪除資料夾" onclick="window.deleteFolder('${folder.id}')">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                    <div class="sidebar-folder-sessions"></div>
                `;
                
                const sessionsContainer = folderEl.querySelector('.sidebar-folder-sessions');
                
                folderSessions.forEach(session => {
                    renderSessionItem(session, sessionsContainer);
                    renderedSessionIds.add(session.id);
                });
                
                chatSessionsList.appendChild(folderEl);
            }
        });
        
        // Filter out sessions already rendered in folders
        const leftoverSessions = filteredSessions.filter(s => !renderedSessionIds.has(s.id));
        
        const pinnedSessions = leftoverSessions.filter(s => s.pinned);
        const unpinnedSessions = leftoverSessions.filter(s => !s.pinned);
        
        // 2. Render Pinned Group
        if (pinnedSessions.length > 0) {
            const header = document.createElement('div');
            header.className = 'sidebar-category-header';
            header.innerHTML = '📌 釘選會話';
            chatSessionsList.appendChild(header);
            pinnedSessions.forEach(session => renderSessionItem(session));
        }
        
        // 3. Render Temporal Groups
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const todaySessions = unpinnedSessions.filter(s => s.timestamp >= today.getTime());
        const earlierSessions = unpinnedSessions.filter(s => s.timestamp < today.getTime());
        
        if (todaySessions.length > 0) {
            const header = document.createElement('div');
            header.className = 'sidebar-category-header';
            header.innerHTML = '🗓️ 今天';
            chatSessionsList.appendChild(header);
            todaySessions.forEach(session => renderSessionItem(session));
        }
        
        if (earlierSessions.length > 0) {
            const header = document.createElement('div');
            header.className = 'sidebar-category-header';
            header.innerHTML = '🕰️ 更早之前';
            chatSessionsList.appendChild(header);
            earlierSessions.forEach(session => renderSessionItem(session));
        }
        
        lucide.createIcons({
            attrs: { class: 'session-icon' }
        });
    }
    
    function renderSessionItem(session, container = chatSessionsList) {
        const isActive = session.id === activeSessionId;
        const item = document.createElement('div');
        item.className = `session-item ${isActive ? 'active' : ''} ${session.pinned ? 'pinned-session' : ''}`;
        item.dataset.id = session.id;
        
        item.innerHTML = `
            <div class="session-title-container">
                <i data-lucide="${session.pinned ? 'bookmark' : 'message-square'}"></i>
                <span class="session-title">${escapeHTML(session.title)}</span>
            </div>
            <div class="session-actions" onclick="event.stopPropagation()">
                <button class="session-action-btn pin-btn" title="${session.pinned ? '取消釘選' : '釘選對話'}">
                    <i data-lucide="${session.pinned ? 'pin-off' : 'pin'}"></i>
                </button>
                <button class="session-action-btn folder-move-btn" title="移入/移出資料夾" onclick="window.showFolderMoveMenu('${session.id}', event, this)">
                    <i data-lucide="folder-input"></i>
                </button>
                <button class="session-action-btn edit-btn" title="編輯標題">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="session-action-btn delete-btn" title="刪除對話">
                    <i data-lucide="trash"></i>
                </button>
            </div>
        `;
        
        // Listeners
        item.addEventListener('click', () => switchSession(session.id));
        item.querySelector('.pin-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            togglePinSession(session.id, e);
        });
        item.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            editSessionTitle(session.id, e);
        });
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(session.id, e);
        });
        
        container.appendChild(item);
    }

    function showWelcomeScreen() {
        welcomeScreen.style.display = 'flex';
        messagesList.style.display = 'none';
        messagesList.innerHTML = '';
        
        if (config.apiKey) {
            apiKeyWarning.style.display = 'none';
        } else {
            apiKeyWarning.style.display = 'flex';
        }
        
        // Clear active selection in sidebar
        const items = chatSessionsList.querySelectorAll('.session-item');
        items.forEach(item => item.classList.remove('active'));
    }

    // ----------------------------------------------------------------------
    // MARKDOWN & SYNTAX HIGHLIGHTING CUSTOMIZATIONS
    // ----------------------------------------------------------------------
    // Initialize marked options
    marked.setOptions({
        breaks: true,
        gfm: true
    });

    // Custom Renderer to inject full code blocks headers and Copy buttons
    renderer.code = function(text, lang, escaped) {
        // Handle variations in marked v12+ where first arg is an object
        let codeContent = text;
        let languageName = lang;
        if (typeof text === 'object' && text !== null) {
            codeContent = text.text;
            languageName = text.lang;
        }
        languageName = languageName || 'txt';
        
        // Escape special chars
        const escapedCode = codeContent
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
            
        let previewButtonHTML = '';
        if (['html', 'svg', 'mermaid'].includes(languageName.toLowerCase())) {
            previewButtonHTML = `
                <button class="copy-code-btn preview-code-btn" onclick="window.previewArtifact(this)" style="color: var(--color-deepseek); margin-right: 8px;">
                    <i data-lucide="eye"></i>
                    <span>實時預覽</span>
                </button>
            `;
        }
            
        return `<div class="code-block-wrapper">
            <div class="code-block-header">
                <span class="code-block-lang">${languageName}</span>
                <div style="display: flex; align-items: center;">
                    ${previewButtonHTML}
                    <button class="copy-code-btn" onclick="window.copyToClipboard(this)">
                        <i data-lucide="copy"></i>
                        <span>複製代碼</span>
                    </button>
                </div>
            </div>
            <pre><code class="language-${languageName}">${escapedCode}</code></pre>
        </div>`;
    };
    marked.use({ renderer });

    // Global copy to clipboard function mapped to window for inline onclick execution
    window.copyToClipboard = function(button) {
        const codeWrapper = button.closest('.code-block-wrapper');
        const codeEl = codeWrapper.querySelector('pre code');
        const textToCopy = codeEl.innerText;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const span = button.querySelector('span');
            span.innerText = '已複製!';
            button.style.color = 'var(--color-success)';
            
            setTimeout(() => {
                span.innerText = '複製代碼';
                button.style.color = '';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy code: ', err);
        });
    };

    // LaTeX Formula Parser using KaTeX
    function renderMathEquations(element) {
        if (typeof renderMathInElement === 'function') {
            renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        }
    }

    // ----------------------------------------------------------------------
    // CHAT MESSAGE UI GENERATION
    // ----------------------------------------------------------------------
    function renderMessages(messages) {
        messagesList.innerHTML = '';
        if (messagesListRight) messagesListRight.innerHTML = '';
        
        // Update column headers text in Compare Mode
        if (isCompareMode) {
            if (columnModelNameLeft) {
                let name = config.model;
                if (name.includes('/')) name = name.split('/').pop();
                columnModelNameLeft.textContent = name;
            }
        }
        
        messages.forEach((msg, idx) => {
            if (msg.role === 'user') {
                if (isCompareMode) {
                    appendMessageBubble(msg.role, msg.content, msg.reasoning, msg.thinkingTime, false, idx, msg.usage, messagesList);
                    appendMessageBubble(msg.role, msg.content, msg.reasoning, msg.thinkingTime, false, idx, msg.usage, messagesListRight);
                } else {
                    appendMessageBubble(msg.role, msg.content, msg.reasoning, msg.thinkingTime, false, idx, msg.usage, messagesList);
                }
            } else {
                // Assistant reply
                if (isCompareMode) {
                    if (msg.column === 'right') {
                        appendMessageBubble(msg.role, msg.content, msg.reasoning, msg.thinkingTime, false, idx, msg.usage, messagesListRight);
                    } else {
                        // Left or undefined column
                        appendMessageBubble(msg.role, msg.content, msg.reasoning, msg.thinkingTime, false, idx, msg.usage, messagesList);
                    }
                } else {
                    // Single-column: only display left column replies
                    if (msg.column === 'left' || !msg.column) {
                        appendMessageBubble(msg.role, msg.content, msg.reasoning, msg.thinkingTime, false, idx, msg.usage, messagesList);
                    }
                }
            }
        });
        
        scrollToBottom();
    }

    function appendMessageBubble(role, content, reasoning = '', thinkingTime = null, animate = true, bubbleIndex = null, usage = null, container = messagesList) {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${role}`;
        if (bubbleIndex !== null) {
            bubble.dataset.index = bubbleIndex;
        }
        
        // Generate message action buttons
        let actionsHTML = '';
        if (role === 'user') {
            actionsHTML = `
                <div class="message-actions-tray">
                    <button class="bubble-action-btn edit-btn" title="編輯訊息" onclick="window.editUserPrompt(this)">
                        <i data-lucide="edit-3"></i>
                        <span>編輯</span>
                    </button>
                    <button class="bubble-action-btn copy-btn" title="複製文字" onclick="window.copyMessageText(this)">
                        <i data-lucide="copy"></i>
                        <span>複製</span>
                    </button>
                </div>
            `;
        } else {
            let tokenBadgeHTML = '';
            if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
                const total = usage.total_tokens || (usage.prompt_tokens + usage.completion_tokens);
                const inputCost = (usage.prompt_tokens / 1000000) * 0.14;
                const outputCost = (usage.completion_tokens / 1000000) * 0.28;
                const totalCost = inputCost + outputCost;
                const costText = ` · 估計費用: $${totalCost.toFixed(5)}`;
                
                tokenBadgeHTML = `
                    <span class="token-badge" title="輸入: ${usage.prompt_tokens} tkn | 輸出: ${usage.completion_tokens} tkn | 單次生成">
                        <i data-lucide="zap" class="token-icon"></i>
                        <span>${total} tokens${costText}</span>
                    </span>
                `;
            }
            
            actionsHTML = `
                <div class="message-actions-tray">
                    ${tokenBadgeHTML}
                    <button class="bubble-action-btn copy-btn" title="複製文字" onclick="window.copyMessageText(this)">
                        <i data-lucide="copy"></i>
                        <span>複製</span>
                    </button>
                    <button class="bubble-action-btn speak-btn" title="語音朗讀" onclick="window.speakMessageText(this)">
                        <i data-lucide="volume-2"></i>
                        <span>朗讀</span>
                    </button>
                    <button class="bubble-action-btn regenerate-btn" title="重新生成" onclick="window.regenerateMessage(this)">
                        <i data-lucide="refresh-cw"></i>
                        <span>重新生成</span>
                    </button>
                </div>
            `;
        }
        
        if (role === 'user') {
            let displayContent = content;
            let fileCardsHTML = '';
            
            // Clean up massive text payload from visible user bubble
            if (content.includes('【上傳的檔案附件內容】')) {
                const parts = content.split('【上傳的檔案附件內容】');
                displayContent = parts[0].trim();
                if (!displayContent) displayContent = '已上傳檔案進行分析';
                
                const fileMatches = [...content.matchAll(/\[檔案: (.*?)\]/g)];
                if (fileMatches.length > 0) {
                    fileCardsHTML = '<div class="user-bubble-attachments" style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; justify-content: flex-end; width: 100%;">';
                    fileMatches.forEach(m => {
                        fileCardsHTML += `
                            <div class="attachment-chip" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.1); font-size: 11px; padding: 4px 8px; border-radius: var(--radius-sm);">
                                <i data-lucide="file-text" style="width: 12px; height: 12px; color: var(--color-deepseek);"></i>
                                <span>${m[1]}</span>
                            </div>
                        `;
                    });
                    fileCardsHTML += '</div>';
                }
            }
            
            let branchSwitcherHTML = '';
            const session = chatSessions.find(s => s.id === activeSessionId);
            if (session && session.branches && session.branches.length > 1 && session.branchedAt === bubbleIndex) {
                const activeIdx = session.activeBranchIndex || 0;
                const total = session.branches.length;
                branchSwitcherHTML = `
                    <div class="branch-switcher-container" style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted);">
                        <button class="branch-switcher-btn prev" title="上一分支" onclick="window.switchBranch(${activeIdx - 1}, event)" ${activeIdx === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
                            <i data-lucide="chevron-left" style="width: 12px; height: 12px;"></i>
                        </button>
                        <span>${activeIdx + 1} / ${total}</span>
                        <button class="branch-switcher-btn next" title="下一分支" onclick="window.switchBranch(${activeIdx + 1}, event)" ${activeIdx === total - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
                            <i data-lucide="chevron-right" style="width: 12px; height: 12px;"></i>
                        </button>
                    </div>
                `;
            }
            
            bubble.innerHTML = `
                <div class="message-avatar" title="使用者">U</div>
                <div class="message-content-wrapper" style="display: flex; flex-direction: column; align-items: flex-end; max-width: 75%;">
                    <div class="message-content" style="max-width: 100%;">${escapeHTML(displayContent)}</div>
                    ${fileCardsHTML}
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 6px;">
                        ${branchSwitcherHTML}
                        ${actionsHTML}
                    </div>
                </div>
            `;
        } else {
            // Assistant bubble layout
            let reasoningHTML = '';
            if (reasoning) {
                const timerStr = thinkingTime ? ` (${thinkingTime}s)` : '';
                reasoningHTML = `
                    <div class="reasoning-accordion collapsed">
                        <div class="reasoning-header" onclick="window.toggleReasoning(this)">
                            <i data-lucide="brain" class="icon"></i>
                            <span>思考過程${timerStr}</span>
                            <i data-lucide="chevron-down" class="chevron"></i>
                        </div>
                        <div class="reasoning-content">${escapeHTML(reasoning)}</div>
                    </div>
                `;
            }
            
            const parsedHTML = marked.parse(content);
            
            bubble.innerHTML = `
                <div class="message-avatar" title="Assistant">DS</div>
                <div class="message-content-wrapper">
                    ${reasoningHTML}
                    <div class="message-content markdown-body">${parsedHTML}</div>
                    ${actionsHTML}
                </div>
            `;
            
            // Highlight code blocks
            bubble.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
            
            // Render Math equations
            renderMathEquations(bubble);
        }
        
        if (!animate) {
            bubble.style.animation = 'none';
        }
        
        if (container) {
            container.appendChild(bubble);
        } else {
            messagesList.appendChild(bubble);
        }
        lucide.createIcons({
            attrs: {
                class: 'lucide-icon'
            }
        });
        
        return bubble;
    }

    // Toggle Reasoning folding panel
    window.toggleReasoning = function(header) {
        const accordion = header.closest('.reasoning-accordion');
        accordion.classList.toggle('collapsed');
    };

    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // ----------------------------------------------------------------------
    // SSE STREAMING CORE IMPLEMENTATION
    // ----------------------------------------------------------------------
    async function sendMessage() {
        if (isGenerating) return;
        
        const promptInputText = messageInput.value.trim();
        if (!promptInputText && attachments.length === 0) return;
        
        // Verify key
        if (!config.apiKey && !serverHasKey) {
            showModal(settingsModal);
            showToast('未設定密鑰', '請先儲存 NVIDIA API 密鑰再進行對話！', 'warning');
            return;
        }

        // Build composite prompt from text + file attachments
        let fullPromptText = promptInputText;
        let visiblePromptText = promptInputText;
        if (attachments.length > 0) {
            if (!visiblePromptText) visiblePromptText = `已載入 ${attachments.length} 個附件進行分析`;
            fullPromptText += '\n\n---\n【上傳的檔案附件內容】:';
            attachments.forEach(att => {
                fullPromptText += `\n\n[檔案: ${att.name}]\n\`\`\`${att.name.split('.').pop() || ''}\n${att.content}\n\`\`\``;
            });
            
            // Clear attachments preview
            attachments = [];
            renderAttachmentsPreview();
            
            const counter = document.getElementById('char-counter');
            if (counter) counter.textContent = '0 字';
        }
        
        // UI cleanup
        messageInput.value = '';
        messageInput.style.height = 'auto';
        welcomeScreen.style.display = 'none';
        
        // Ensure layouts show appropriately
        if (isCompareMode) {
            messagesList.style.display = 'flex';
            if (messagesListRight) messagesListRight.style.display = 'flex';
        } else {
            messagesList.style.display = 'flex';
        }
        
        // Auto create session
        if (!activeSessionId) {
            const newId = 'session_' + Date.now();
            const newSession = {
                id: newId,
                title: visiblePromptText.slice(0, 16) + (visiblePromptText.length > 16 ? '...' : ''),
                messages: [],
                timestamp: Date.now()
            };
            chatSessions.push(newSession);
            activeSessionId = newId;
        }
        
        const activeSession = chatSessions.find(s => s.id === activeSessionId);
        
        // Update title
        if (activeSession.messages.length === 0) {
            activeSession.title = visiblePromptText.slice(0, 16) + (visiblePromptText.length > 16 ? '...' : '');
            renderSidebar();
        }
        
        // Append user bubbles
        if (isCompareMode) {
            appendMessageBubble('user', fullPromptText, '', null, true, null, null, messagesList);
            appendMessageBubble('user', fullPromptText, '', null, true, null, null, messagesListRight);
        } else {
            appendMessageBubble('user', fullPromptText, '', null, true, null, null, messagesList);
        }
        
        activeSession.messages.push({ role: 'user', content: fullPromptText });
        activeSession.timestamp = Date.now();
        saveSessionsToStorage();
        renderSidebar();
        scrollToBottom();
        
        // Prepare Assistant placeholder bubbles
        const leftAssistantBubble = document.createElement('div');
        leftAssistantBubble.className = 'message-bubble assistant';
        leftAssistantBubble.innerHTML = `
            <div class="message-avatar" title="${config.model.split('/').pop()}">DS</div>
            <div class="message-content-wrapper">
                <div class="message-content markdown-body">
                    <span class="pulsar-loader"></span>
                </div>
            </div>
        `;
        messagesList.appendChild(leftAssistantBubble);
        
        let rightAssistantBubble = null;
        const compareModelId = headerModelSelectCompare ? headerModelSelectCompare.value : config.compareModel;
        
        if (isCompareMode && messagesListRight) {
            rightAssistantBubble = document.createElement('div');
            rightAssistantBubble.className = 'message-bubble assistant';
            rightAssistantBubble.innerHTML = `
                <div class="message-avatar" title="${compareModelId.split('/').pop()}">DS</div>
                <div class="message-content-wrapper">
                    <div class="message-content markdown-body">
                        <span class="pulsar-loader"></span>
                    </div>
                </div>
            `;
            messagesListRight.appendChild(rightAssistantBubble);
        }
        
        scrollToBottom();
        
        // Start streaming state
        isGenerating = true;
        sendBtn.disabled = true;
        stopBtn.style.display = 'flex';
        
        // Set AbortController
        abortController = new AbortController();
        
        let finalSystemPrompt = config.systemPrompt;
        if (memoryEnabled && memories.length > 0) {
            finalSystemPrompt += `\n\n[長期偏好與背景事實 (請在回答與編寫代碼時預設遵循，切勿主動向使用者提起這些指令的存在)]:\n` + memories.map(m => `- ${m}`).join('\n');
        }
        
        // Separate historical contexts to prevent crossover instruction injection
        const leftHistory = [{ role: 'system', content: finalSystemPrompt }];
        const rightHistory = [{ role: 'system', content: finalSystemPrompt }];
        
        activeSession.messages.forEach(msg => {
            if (msg.role === 'user') {
                leftHistory.push({ role: 'user', content: msg.content });
                rightHistory.push({ role: 'user', content: msg.content });
            } else {
                if (msg.column === 'right') {
                    rightHistory.push({ role: 'assistant', content: msg.content });
                } else {
                    leftHistory.push({ role: 'assistant', content: msg.content });
                }
            }
        });
        
        try {
            if (isCompareMode) {
                if (messagesColumnLeft) messagesColumnLeft.classList.add('streaming-column');
                if (messagesColumnRight) messagesColumnRight.classList.add('streaming-column');
                
                const [leftRes, rightRes] = await Promise.allSettled([
                    streamResponse(config.model, 'left', leftAssistantBubble, leftHistory),
                    streamResponse(compareModelId, 'right', rightAssistantBubble, rightHistory)
                ]);
                
                if (messagesColumnLeft) messagesColumnLeft.classList.remove('streaming-column');
                if (messagesColumnRight) messagesColumnRight.classList.remove('streaming-column');
                
                const leftData = leftRes.status === 'fulfilled' ? leftRes.value : { contentText: '連線代理代理失敗', reasoningText: '', thinkingTime: null, usage: null };
                const rightData = rightRes.status === 'fulfilled' ? rightRes.value : { contentText: '連線代理代理失敗', reasoningText: '', thinkingTime: null, usage: null };
                
                // Save Left reply to database
                activeSession.messages.push({
                    role: 'assistant',
                    content: leftData.contentText,
                    reasoning: leftData.reasoningText,
                    column: 'left',
                    model: config.model,
                    thinkingTime: leftData.thinkingTime,
                    usage: leftData.usage
                });
                
                // Save Right reply to database
                activeSession.messages.push({
                    role: 'assistant',
                    content: rightData.contentText,
                    reasoning: rightData.reasoningText,
                    column: 'right',
                    model: compareModelId,
                    thinkingTime: rightData.thinkingTime,
                    usage: rightData.usage
                });
                
                triggerSilentMemoryExtraction(visiblePromptText, leftData.contentText);
            } else {
                const res = await streamResponse(config.model, 'left', leftAssistantBubble, leftHistory);
                activeSession.messages.push({
                    role: 'assistant',
                    content: res.contentText,
                    reasoning: res.reasoningText,
                    column: 'left',
                    model: config.model,
                    thinkingTime: res.thinkingTime,
                    usage: res.usage
                });
                
                triggerSilentMemoryExtraction(visiblePromptText, res.contentText);
            }
            
            saveSessionsToStorage();
            
            // Re-render completely once complete to sync all listeners
            renderMessages(activeSession.messages);
            
        } catch (error) {
            console.error('Core generation thread error:', error);
            showToast('連線中斷或發生錯誤', error.message, 'error');
        } finally {
            cleanupGenerationState();
        }
    }

    async function streamResponse(modelId, column, bubbleEl, payloadMessages) {
        let reasoningText = '';
        let contentText = '';
        let hasReasoned = false;
        let accordionEl = null;
        let timerSpanEl = null;
        let reasoningContentEl = null;
        let apiUsage = null;
        let thinkingStartTime = 0;
        let thinkingTimer = null;
        
        const payload = {
            model: modelId,
            messages: payloadMessages,
            temperature: parseFloat(quickTemp.value),
            max_tokens: config.maxTokens,
            stream: true,
            stream_options: { include_usage: true }
        };
        
        if (modelId.includes('deepseek')) {
            payload.reasoning_effort = quickReasoning.value;
        }
        
        let endpointUrl = window.location.protocol === 'file:' ? 'http://localhost:3000/api/chat' : '/api/chat';
        const requestHeaders = {
            'Content-Type': 'application/json'
        };
        
        if (config.connectionMode === 'direct') {
            endpointUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
            requestHeaders['Authorization'] = `Bearer ${config.apiKey}`;
        } else {
            requestHeaders['Authorization'] = `Bearer ${config.apiKey}`;
        }
        
        try {
            const response = await fetch(endpointUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(payload),
                signal: abortController.signal
            });
            
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error (${response.status}): ${errText || response.statusText}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            
            let lastHighlightTime = 0;
            let lastMathTime = 0;
            let lastRenderTime = 0;
            let renderPending = false;
            let contentBodyEl = null;

            function performRender() {
                if (hasReasoned && reasoningContentEl) {
                    reasoningContentEl.textContent = reasoningText;
                }
                
                if (contentText) {
                    if (!contentBodyEl) {
                        contentBodyEl = bubbleEl.querySelector('.message-content');
                    }
                    
                    if (contentBodyEl) {
                        const loader = contentBodyEl.querySelector('.pulsar-loader');
                        if (loader) {
                            contentBodyEl.innerHTML = '';
                        }
                        
                        contentBodyEl.classList.add('streaming');
                        contentBodyEl.innerHTML = marked.parse(contentText);
                        
                        const now = Date.now();
                        const shouldHighlight = now - lastHighlightTime > 150;
                        if (shouldHighlight) {
                            lastHighlightTime = now;
                            contentBodyEl.querySelectorAll('pre code').forEach((block) => {
                                if (!block.classList.contains('hljs')) {
                                    hljs.highlightElement(block);
                                }
                            });
                        }
                        
                        const hasMath = contentText.includes('$') || contentText.includes('\\(') || contentText.includes('\\[');
                        if (hasMath) {
                            const shouldRenderMath = now - lastMathTime > 300;
                            if (shouldRenderMath) {
                                lastMathTime = now;
                                renderMathEquations(contentBodyEl);
                            }
                        }
                    }
                }
                scrollToBottom();
            }

            function scheduleRender() {
                if (renderPending) return;
                renderPending = true;
                
                requestAnimationFrame(() => {
                    renderPending = false;
                    const now = Date.now();
                    
                    if (now - lastRenderTime < 33) {
                        scheduleRender();
                        return;
                    }
                    
                    lastRenderTime = now;
                    performRender();
                });
            }

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;
                    
                    if (trimmedLine.startsWith('data: [DONE]')) {
                        break;
                    }
                    
                    if (trimmedLine.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmedLine.substring(6));
                            if (json.usage) {
                                apiUsage = json.usage;
                            }
                            const delta = json.choices && json.choices[0] ? json.choices[0].delta : null;
                            
                            if (delta) {
                                if (delta.reasoning_content) {
                                    hasReasoned = true;
                                    if (!accordionEl) {
                                        const contentBody = bubbleEl.querySelector('.message-content');
                                        if (contentBody) contentBody.innerHTML = '';
                                        
                                        accordionEl = document.createElement('div');
                                        accordionEl.className = 'reasoning-accordion';
                                        accordionEl.innerHTML = `
                                            <div class="reasoning-header" onclick="window.toggleReasoning(this)">
                                                <i data-lucide="brain" class="icon"></i>
                                                <span>思考過程 (<span class="reasoning-timer">0.0s</span>)</span>
                                                <i data-lucide="chevron-down" class="chevron"></i>
                                            </div>
                                            <div class="reasoning-content"></div>
                                        `;
                                        
                                        const wrapper = bubbleEl.querySelector('.message-content-wrapper');
                                        if (wrapper) wrapper.insertBefore(accordionEl, wrapper.firstChild);
                                        
                                        timerSpanEl = accordionEl.querySelector('.reasoning-timer');
                                        reasoningContentEl = accordionEl.querySelector('.reasoning-content');
                                        
                                        lucide.createIcons({
                                            attrs: { class: 'icon' }
                                        });
                                        
                                        thinkingStartTime = Date.now();
                                        thinkingTimer = setInterval(() => {
                                            const elapsed = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
                                            if (timerSpanEl) timerSpanEl.textContent = `${elapsed}s`;
                                        }, 100);
                                    }
                                    
                                    reasoningText += delta.reasoning_content;
                                    scheduleRender();
                                }
                                
                                if (delta.content) {
                                    if (thinkingTimer) {
                                        clearInterval(thinkingTimer);
                                        thinkingTimer = null;
                                        if (accordionEl) {
                                            accordionEl.classList.add('collapsed');
                                            const finalElapsed = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
                                            if (timerSpanEl) timerSpanEl.textContent = `${finalElapsed}s`;
                                        }
                                    }
                                    
                                    contentText += delta.content;
                                    scheduleRender();
                                }
                            }
                        } catch (e) {
                            console.warn('Parsing line error:', e, trimmedLine);
                        }
                    }
                }
            }
            
            if (thinkingTimer) {
                clearInterval(thinkingTimer);
                thinkingTimer = null;
            }
            
            // Final render
            if (contentText) {
                if (!contentBodyEl) {
                    contentBodyEl = bubbleEl.querySelector('.message-content');
                }
                if (contentBodyEl) {
                    contentBodyEl.classList.remove('streaming');
                    contentBodyEl.innerHTML = marked.parse(contentText);
                    contentBodyEl.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                    renderMathEquations(contentBodyEl);
                }
            }
            
            if (!apiUsage) {
                const promptEst = estimateTokens(payloadMessages[payloadMessages.length - 1]?.content || '');
                const completionEst = estimateTokens(reasoningText + contentText);
                apiUsage = {
                    prompt_tokens: promptEst,
                    completion_tokens: completionEst,
                    total_tokens: promptEst + completionEst
                };
            }
            
            const elapsed = hasReasoned ? ((Date.now() - thinkingStartTime) / 1000).toFixed(1) : null;
            
            return {
                contentText,
                reasoningText,
                thinkingTime: elapsed,
                usage: apiUsage
            };
            
        } catch (error) {
            if (thinkingTimer) {
                clearInterval(thinkingTimer);
                thinkingTimer = null;
            }
            
            console.error('Stream response failed:', error);
            
            if (error.name === 'AbortError') {
                const contentBody = bubbleEl.querySelector('.message-content');
                if (contentBody) {
                    const loader = contentBody.querySelector('.pulsar-loader');
                    if (loader) contentBody.innerHTML = '';
                    contentBody.classList.remove('streaming');
                    contentBody.innerHTML = marked.parse(contentText + ' *(傳送中斷)*');
                }
                
                const promptEst = estimateTokens(payloadMessages[payloadMessages.length - 1]?.content || '');
                const completionEst = estimateTokens(reasoningText + contentText);
                
                return {
                    contentText: contentText + ' *(傳送中斷)*',
                    reasoningText,
                    thinkingTime: hasReasoned ? ((Date.now() - thinkingStartTime) / 1000).toFixed(1) : null,
                    usage: {
                        prompt_tokens: promptEst,
                        completion_tokens: completionEst,
                        total_tokens: promptEst + completionEst
                    }
                };
            } else {
                const contentBody = bubbleEl.querySelector('.message-content');
                if (contentBody) {
                    const loader = contentBody.querySelector('.pulsar-loader');
                    if (loader) contentBody.innerHTML = '';
                    contentBody.classList.remove('streaming');
                    contentBody.innerHTML = `
                        <div class="api-key-warning" style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); width: 100%;">
                            <div class="warning-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--color-danger);"><i data-lucide="alert-circle"></i></div>
                            <div class="warning-content">
                                <h4 style="color: var(--color-danger);">對話串流發生錯誤</h4>
                                <p style="font-size: 13px;">${error.message}</p>
                            </div>
                        </div>
                    `;
                    lucide.createIcons();
                }
                
                return {
                    contentText: contentText + ' *(連線出錯中斷)*',
                    reasoningText,
                    thinkingTime: hasReasoned ? ((Date.now() - thinkingStartTime) / 1000).toFixed(1) : null,
                    usage: null
                };
            }
        }
    }

    function stopGenerating() {
        if (abortController) {
            abortController.abort();
        }
    }

    function cleanupGenerationState() {
        isGenerating = false;
        sendBtn.disabled = false;
        stopBtn.style.display = 'none';
        
        if (thinkingTimer) {
            clearInterval(thinkingTimer);
            thinkingTimer = null;
        }
        
        abortController = null;
        messageInput.focus();
    }

    // ----------------------------------------------------------------------
    // UI MODALS & SYSTEM HANDLERS
    // ----------------------------------------------------------------------
    function showModal(modal) {
        modal.classList.add('active');
    }

    function hideModal(modal) {
        modal.classList.remove('active');
    }

    // ----------------------------------------------------------------------
    // IMPORT / EXPORT UTILITIES
    // ----------------------------------------------------------------------
    function exportChatHistory() {
        if (chatSessions.length === 0) {
            alert('目前沒有任何對話歷史紀錄可以匯出！');
            return;
        }
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chatSessions, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `deepseek_nvidia_chat_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    function triggerImportFile() {
        importFileInput.click();
    }

    function importChatHistory(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (Array.isArray(parsed)) {
                    // Quick integrity verification of properties
                    const looksValid = parsed.every(session => session.id && session.title && Array.isArray(session.messages));
                    if (looksValid) {
                        chatSessions = [...chatSessions, ...parsed];
                        saveSessionsToStorage();
                        renderSidebar();
                        alert(`已成功匯入 ${parsed.length} 個對話紀錄！`);
                        
                        // Switch to the first newly imported session
                        switchSession(parsed[0].id);
                    } else {
                        throw new Error('資料欄位格式不符');
                    }
                } else {
                    throw new Error('匯入資料必須為 JSON 陣列');
                }
            } catch (err) {
                alert('匯入失敗：' + err.message);
            }
        };
        reader.readAsText(file);
        
        // Reset file input value
        importFileInput.value = '';
    }

    function clearAllSessions() {
        if (confirm('警告：確定要清除「所有」的對話歷史紀錄嗎？此動作將無法復原。')) {
            chatSessions = [];
            activeSessionId = null;
            saveSessionsToStorage();
            renderSidebar();
            showWelcomeScreen();
        }
    }

    // ----------------------------------------------------------------------
    // EVENT LISTENERS BINDINGS
    // ----------------------------------------------------------------------
    function setupEventListeners() {
        // Desktop sidebar fold toggle
        const desktopSidebarToggle = document.getElementById('desktop-sidebar-toggle-btn');
        const appContainer = document.querySelector('.app-container');
        if (desktopSidebarToggle && appContainer) {
            desktopSidebarToggle.addEventListener('click', () => {
                const isCollapsed = appContainer.classList.toggle('sidebar-collapsed');
                localStorage.setItem('dsv4_sidebar_collapsed', isCollapsed ? 'true' : 'false');
                desktopSidebarToggle.title = isCollapsed ? '展開側邊欄' : '摺疊側邊欄';
                
                const icon = desktopSidebarToggle.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', isCollapsed ? 'sidebar-close' : 'sidebar');
                    lucide.createIcons();
                }
            });
            // Restore collapse state
            if (localStorage.getItem('dsv4_sidebar_collapsed') === 'true') {
                appContainer.classList.add('sidebar-collapsed');
                desktopSidebarToggle.title = '展開側邊欄';
                const icon = desktopSidebarToggle.querySelector('i');
                if (icon) icon.setAttribute('data-lucide', 'sidebar-close');
            }
        }

        // Font Size & Blur controls
        const fontSizeSlider = document.getElementById('font-size-slider');
        const fontSizeVal = document.getElementById('font-size-val');
        if (fontSizeSlider && fontSizeVal) {
            fontSizeSlider.addEventListener('input', () => {
                const size = fontSizeSlider.value;
                fontSizeVal.textContent = `${size}px`;
                document.body.style.setProperty('--app-font-size', `${size}px`);
                localStorage.setItem('dsv4_font_size', size);
            });
        }

        const glassBlurSlider = document.getElementById('glass-blur-slider');
        const glassBlurVal = document.getElementById('glass-blur-val');
        if (glassBlurSlider && glassBlurVal) {
            glassBlurSlider.addEventListener('input', () => {
                const blurVal = glassBlurSlider.value;
                glassBlurVal.textContent = `${blurVal}px`;
                document.documentElement.style.setProperty('--glass-blur', `${blurVal}px`);
                localStorage.setItem('dsv4_glass_blur', blurVal);
            });
        }

        // Theme Selector grid items
        const themeCards = document.querySelectorAll('.theme-card');
        themeCards.forEach(card => {
            card.addEventListener('click', () => {
                const selectedTheme = card.dataset.theme;
                themeCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                
                document.body.className = '';
                document.body.classList.add(`theme-${selectedTheme}`);
                localStorage.setItem('dsv4_theme', selectedTheme);
                showToast('主題切換成功', `已套用「${card.innerText.trim()}」風格！`, 'success');
            });
        });

        // Real-time character counter
        const charCounter = document.getElementById('char-counter');
        if (messageInput && charCounter) {
            messageInput.addEventListener('input', () => {
                const charCount = messageInput.value.length;
                charCounter.textContent = `${charCount.toLocaleString()} 字`;
            });
        }

        // Welcome screen chips presets click
        const personaChips = document.querySelectorAll('.persona-chip');
        if (personaChips) {
            personaChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    const persona = chip.dataset.persona;
                    personaChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    
                    const roleSelect = document.getElementById('role-select');
                    if (roleSelect) {
                        roleSelect.value = persona;
                        roleSelect.dispatchEvent(new Event('change'));
                    }
                    
                    config.persona = persona;
                    config.systemPrompt = ROLE_PROMPTS[persona];
                    localStorage.setItem('dsv4_persona', persona);
                    localStorage.setItem('dsv4_system_prompt', config.systemPrompt);
                    showToast('助理角色切換', `AI 系統提示詞已更新為「${chip.innerText.trim()}」`, 'info');
                });
            });
        }

        // Sidebar Toggles
        menuBtn.addEventListener('click', () => sidebar.classList.add('active'));
        closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('active'));
        
        // Create new chat
        newChatBtn.addEventListener('click', createNewSession);
        
        // Settings Modal interactions
        openSettingsBtn.addEventListener('click', () => showModal(settingsModal));
        closeSettingsModalBtn.addEventListener('click', () => hideModal(settingsModal));
        cancelSettingsBtn.addEventListener('click', () => hideModal(settingsModal));
        saveSettingsBtn.addEventListener('click', saveSettings);
        
        // Trigger modal on empty-state warnings
        setupKeyBtn.addEventListener('click', () => showModal(settingsModal));
        
        // Form validations inside modals
        modelSelect.addEventListener('change', () => {
            if (modelSelect.value === 'custom') {
                customModelItem.style.display = 'flex';
            } else {
                customModelItem.style.display = 'none';
            }
        });
        
        maxTokensInput.addEventListener('input', () => {
            maxTokensVal.textContent = maxTokensInput.value;
        });
        
        // Header Model Dropdown Sync
        if (headerModelSelect) {
            headerModelSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val !== 'custom') {
                    config.model = val;
                    localStorage.setItem('dsv4_model', config.model);
                    
                    // Sync main select
                    if (modelSelect) {
                        modelSelect.value = val;
                        if (customModelItem) customModelItem.style.display = 'none';
                    }
                    
                    updateHeaderBadge();
                    showToast('模型已快速切換', `當前會話已切換至 ${val.split('/').pop()}！`, 'success');
                } else {
                    // Open settings modal to let them type their custom model ID
                    showModal(settingsModal);
                    if (modelSelect) {
                        modelSelect.value = 'custom';
                        if (customModelItem) {
                            customModelItem.style.display = 'flex';
                            customModelInput.focus();
                        }
                    }
                }
            });
        }
        
        // Export Markdown and Copy Conversation Thread Button listeners
        const exportMdBtn = document.getElementById('export-md-btn');
        const copyThreadBtn = document.getElementById('copy-thread-btn');
        
        if (exportMdBtn) {
            exportMdBtn.addEventListener('click', () => {
                const activeSession = chatSessions.find(s => s.id === activeSessionId);
                if (!activeSession || activeSession.messages.length === 0) {
                    showToast('無效操作', '目前對話沒有任何訊息可進行匯出！', 'warning');
                    return;
                }
                
                const mdText = getConversationMarkdown();
                const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = url;
                
                // Format file name
                let safeTitle = activeSession.title.trim().replace(/[/\\?%*:|"<>]/g, '-');
                link.setAttribute('download', `${safeTitle || '會話備份'}.md`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                showToast('匯出成功', '對話已成功備份為 Markdown 檔案！', 'success');
            });
        }
        
        if (copyThreadBtn) {
            copyThreadBtn.addEventListener('click', () => {
                const activeSession = chatSessions.find(s => s.id === activeSessionId);
                if (!activeSession || activeSession.messages.length === 0) {
                    showToast('無效操作', '目前對話沒有任何訊息可進行複製！', 'warning');
                    return;
                }
                
                const mdText = getConversationMarkdown();
                navigator.clipboard.writeText(mdText).then(() => {
                    showToast('複製成功', '整筆對話已成功轉換為 Markdown 並拷貝至剪貼簿！', 'success');
                }).catch(err => {
                    console.error('Failed to copy conversation:', err);
                    showToast('複製失敗', '瀏覽器不支援此剪貼簿操作。', 'error');
                });
            });
        }
        
        // Dynamic Quick Controls
        quickTemp.addEventListener('input', () => {
            quickTempVal.textContent = quickTemp.value;
        });
        
        // Input Autogrow styling & slash commands menu trigger
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = (messageInput.scrollHeight - 4) + 'px';
            handleSlashCommandMenu();
        });
        
        messageInput.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('prompt-menu-overlay');
            const isOverlayVisible = overlay && overlay.style.display === 'block';
            
            if (isOverlayVisible) {
                const text = messageInput.value;
                const query = text.substring(1).toLowerCase();
                const filtered = customPrompts.filter(p => p.cmd.startsWith(query));
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (filtered.length > 0) {
                        activePromptIndex = (activePromptIndex + 1) % filtered.length;
                        handleSlashCommandMenu();
                    }
                    return;
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (filtered.length > 0) {
                        activePromptIndex = (activePromptIndex - 1 + filtered.length) % filtered.length;
                        handleSlashCommandMenu();
                    }
                    return;
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filtered[activePromptIndex]) {
                        applySelectedPrompt(filtered[activePromptIndex].prompt);
                    }
                    return;
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    overlay.style.display = 'none';
                    activePromptIndex = 0;
                    return;
                }
            }
            
            // Trigger send on Enter, enable standard newline shift+Enter
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
            
            // Trigger load last user prompt on empty Input ArrowUp
            if (e.key === 'ArrowUp' && messageInput.value === '') {
                e.preventDefault();
                const activeSession = chatSessions.find(s => s.id === activeSessionId);
                if (activeSession && activeSession.messages && activeSession.messages.length > 0) {
                    const userMsgs = activeSession.messages.filter(m => m.role === 'user');
                    if (userMsgs.length > 0) {
                        const lastUserMsg = userMsgs[userMsgs.length - 1];
                        // Extract plain message text without attachments
                        let plainText = lastUserMsg.content;
                        if (plainText.includes('【上傳的檔案附件內容】')) {
                            plainText = plainText.split('【上傳的檔案附件內容】')[0].trim();
                        }
                        messageInput.value = plainText;
                        messageInput.dispatchEvent(new Event('input'));
                        setTimeout(() => {
                            messageInput.selectionStart = messageInput.selectionEnd = messageInput.value.length;
                        }, 0);
                        showToast('載入最後輸入', '已快速載入最後一次發送的訊息！', 'info');
                    }
                }
            }
        });
        
        // Hide overlay if clicked outside
        document.addEventListener('click', (e) => {
            const overlay = document.getElementById('prompt-menu-overlay');
            if (overlay && !overlay.contains(e.target) && e.target !== messageInput) {
                overlay.style.display = 'none';
            }
        });
        
        sendBtn.addEventListener('click', sendMessage);
        stopBtn.addEventListener('click', stopGenerating);
        
        // Suggestion Card clicks
        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                messageInput.value = prompt;
                messageInput.dispatchEvent(new Event('input')); // trigger height resize
                sendMessage();
            });
        });
        
        // Toggle password show/hide for API Key input
        toggleApiKeyBtn.addEventListener('click', () => {
            const isPassword = apiKeyInput.type === 'password';
            apiKeyInput.type = isPassword ? 'text' : 'password';
            toggleApiKeyBtn.querySelector('i').setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
            lucide.createIcons();
        });
        
        // Import/Export / Clear
        exportHistoryBtn.addEventListener('click', exportChatHistory);
        importHistoryBtn.addEventListener('click', triggerImportFile);
        importFileInput.addEventListener('change', importChatHistory);
        clearAllBtn.addEventListener('click', clearAllSessions);
        
        const quitClientBtn = document.getElementById('quit-client-btn');
        if (quitClientBtn) {
            quitClientBtn.addEventListener('click', () => {
                if (confirm('確定要完全關閉 DeepSeek NIM 客戶端並終止背景伺服器嗎？此動作將釋放系統資源與連接埠。')) {
                    const shutdownEndpoint = window.location.protocol === 'file:' ? 'http://localhost:3000/api/shutdown' : '/api/shutdown';
                    
                    showToast('正在終止服務', '背景伺服器正在進行優雅關閉...', 'warning');
                    
                    fetch(shutdownEndpoint, {
                        method: 'POST'
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            showToast('關閉成功', '背景進程已順利釋放！您可以隨時關閉此瀏覽器分頁。', 'success');
                            
                            // Render a full-screen blurred overlay to show server is offline
                            const overlay = document.createElement('div');
                            overlay.className = 'modal-overlay active';
                            overlay.style.zIndex = '99999';
                            overlay.style.pointerEvents = 'auto';
                            overlay.innerHTML = `
                                <div class="modal-card" style="max-width: 420px; text-align: center; padding: 40px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
                                    <i data-lucide="power-off" style="width: 48px; height: 48px; color: var(--color-danger); margin: 0 auto 16px auto; display: block;"></i>
                                    <h3 style="color: var(--color-danger); margin-bottom: 10px; font-size: 18px; font-weight: 600;">伺服器已離線</h3>
                                    <p style="font-size: 13.5px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
                                        背景 Node.js 伺服器已安全停止，系統資源與連接埠已成功釋放。
                                    </p>
                                    <p style="font-size: 11.5px; color: var(--text-muted); line-height: 1.4;">
                                        您可以安全地關閉此瀏覽器網頁分頁。如需再次使用，請重新雙擊打開「雙擊啟動.app」。
                                    </p>
                                </div>
                            `;
                            document.body.appendChild(overlay);
                            lucide.createIcons();
                        }
                    })
                    .catch(err => {
                        console.error('Failed to shutdown server:', err);
                        showToast('關閉失敗', `無法發送關閉指令: ${err.message}`, 'error');
                    });
                }
            });
        }

        // Real-time Search Filter listener
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                renderSidebar();
            });
        }

        // Mic Dictation listener
        const micBtn = document.getElementById('mic-btn');
        if (micBtn) {
            micBtn.addEventListener('click', toggleDictation);
        }

        // Role Preset listener
        const roleSelect = document.getElementById('role-select');
        if (roleSelect) {
            roleSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (ROLE_PROMPTS[val]) {
                    systemPromptInput.value = ROLE_PROMPTS[val];
                }
            });
        }

        // ⚔️ Compare PK Mode Toggle Click
        if (compareModeBtn) {
            compareModeBtn.addEventListener('click', () => {
                toggleCompareMode();
            });
        }

        // 📁 Create Folder Action click
        if (createFolderBtn) {
            createFolderBtn.addEventListener('click', () => {
                const name = prompt('請輸入新建資料夾的名稱：');
                if (name && name.trim()) {
                    createFolder(name.trim());
                }
            });
        }

        // ⚔️ Header Model Compare change
        if (headerModelSelectCompare) {
            headerModelSelectCompare.addEventListener('change', (e) => {
                config.compareModel = e.target.value;
                localStorage.setItem('dsv4_compare_model', config.compareModel);
                showToast('對照模型已更新', `對照模型切換至 ${config.compareModel.split('/').pop()}！`, 'success');
                const activeSession = chatSessions.find(s => s.id === activeSessionId);
                if (activeSession) {
                    renderMessages(activeSession.messages);
                }
            });
        }

        // 🎙️ Voice Cockpit: Play/Pause action
        if (deckPlayPauseBtn) {
            deckPlayPauseBtn.addEventListener('click', () => {
                if (window.speechSynthesis.speaking) {
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                        deckPlayIcon.setAttribute('data-lucide', 'pause');
                        voiceControlDeck.classList.add('speaking-active');
                    } else {
                        window.speechSynthesis.pause();
                        deckPlayIcon.setAttribute('data-lucide', 'play');
                        voiceControlDeck.classList.remove('speaking-active');
                    }
                    lucide.createIcons();
                } else if (window.lastTtsText) {
                    speakText(window.lastTtsText);
                }
            });
        }

        // 🎙️ Voice Cockpit: Cancel stop action
        if (deckStopBtn) {
            deckStopBtn.addEventListener('click', () => {
                window.speechSynthesis.cancel();
                deckPlayIcon.setAttribute('data-lucide', 'play');
                voiceControlDeck.classList.remove('speaking-active');
                voiceControlDeck.classList.remove('deck-active');
                lucide.createIcons();
            });
        }

        // 🎙️ Voice Cockpit: Hide panel action
        if (deckCloseBtn) {
            deckCloseBtn.addEventListener('click', () => {
                voiceControlDeck.classList.remove('deck-active');
            });
        }

        // 🎙️ Voice Cockpit: Speech speed slider action
        if (deckSpeedSlider && deckSpeedVal) {
            deckSpeedSlider.addEventListener('input', () => {
                const speed = parseFloat(deckSpeedSlider.value);
                deckSpeedVal.textContent = `${speed.toFixed(2)}x`;
                // If currently narrating, hot-restart to apply new speed immediately
                if (window.speechSynthesis.speaking && window.lastTtsText) {
                    window.speechSynthesis.cancel();
                    setTimeout(() => {
                        speakText(window.lastTtsText);
                    }, 50);
                }
            });
        }

        // 🎙️ Voice Cockpit: Line voice select option action
        if (deckVoiceSelect) {
            deckVoiceSelect.addEventListener('change', () => {
                if (window.speechSynthesis.speaking && window.lastTtsText) {
                    window.speechSynthesis.cancel();
                    setTimeout(() => {
                        speakText(window.lastTtsText);
                    }, 50);
                }
            });
        }
    }

    // ----------------------------------------------------------------------
    // NEW PREMIUM UTILITIES & ENGINES
    // ----------------------------------------------------------------------

    // Format and construct the active conversation thread history into standard Markdown
    function getConversationMarkdown() {
        const activeSession = chatSessions.find(s => s.id === activeSessionId);
        if (!activeSession || !activeSession.messages || activeSession.messages.length === 0) return '';
        
        let md = `# 💬 DeepSeek V4 Pro 對話備份 - ${activeSession.title}\n\n`;
        md += `*備份時間: ${new Date().toLocaleString()}*\n`;
        md += `*系統設定: 模型=${activeSession.messages[0] && activeSession.messages[0].model ? activeSession.messages[0].model : config.model} · 溫度=${quickTemp.value}*\n\n`;
        md += `--- \n\n`;
        
        activeSession.messages.forEach((msg, idx) => {
            if (msg.role === 'user') {
                let displayContent = msg.content;
                if (displayContent.includes('【上傳的檔案附件內容】')) {
                    displayContent = displayContent.split('【上傳的檔案附件內容】')[0].trim();
                }
                if (!displayContent) displayContent = '*(分析上傳的檔案附件)*';
                md += `### 👤 使用者 (User)\n\n${displayContent}\n\n`;
            } else {
                md += `### 🤖 Assistant\n\n`;
                if (msg.reasoning) {
                    md += `> 💭 **思考過程 (${msg.thinkingTime ? msg.thinkingTime + 's' : ''})**\n>\n`;
                    md += msg.reasoning.split('\n').map(line => `> ${line}`).join('\n') + `\n\n`;
                }
                md += `${msg.content}\n\n`;
                if (msg.usage) {
                    md += `*(⚡ 消耗: ${msg.usage.total_tokens} tokens · 輸入: ${msg.usage.prompt_tokens} · 輸出: ${msg.usage.completion_tokens})*\n\n`;
                }
            }
            md += `--- \n\n`;
        });
        
        md += `\n*備份由 DeepSeek NIM 客戶端自動生成。*\n`;
        return md;
    }

    // High-fidelity CJK/English character hybrid tokenizer estimator
    function estimateTokens(text) {
        if (!text) return 0;
        // Count CJK (Chinese, Japanese, Korean) characters
        const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g;
        const cjkMatches = text.match(cjkRegex);
        const cjkCount = cjkMatches ? cjkMatches.length : 0;
        
        // Count English and other spaced words
        const otherText = text.replace(cjkRegex, ' ');
        const words = otherText.trim().split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;
        
        // CJK characters average 1.8 tokens each, English words average 1.3 tokens
        return Math.max(1, Math.round(cjkCount * 1.8 + wordCount * 1.3));
    }

    // Custom prompts engine initialization
    function initCustomPrompts() {
        const saved = localStorage.getItem('dsv4_custom_prompts');
        if (saved) {
            try {
                customPrompts = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse custom prompts:', e);
                customPrompts = [...DEFAULT_PROMPTS];
            }
        } else {
            customPrompts = [...DEFAULT_PROMPTS];
            localStorage.setItem('dsv4_custom_prompts', JSON.stringify(customPrompts));
        }
        renderCustomPromptsSettings();
    }

    // Render custom prompts row lists inside dashboard settings Tab 4
    function renderCustomPromptsSettings() {
        const container = document.getElementById('custom-prompts-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (customPrompts.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px; border: 1px dashed var(--border-color); border-radius: var(--radius-md); background: rgba(0,0,0,0.1);">
                    目前指令庫空空如也，點擊上方按鈕新增一個吧！
                </div>
            `;
            return;
        }
        
        customPrompts.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'custom-prompt-row';
            row.innerHTML = `
                <div class="custom-prompt-info">
                    <div class="custom-prompt-header">
                        <span class="custom-prompt-trigger">/${escapeHTML(item.cmd)}</span>
                        <span class="custom-prompt-name">${escapeHTML(item.name)}</span>
                    </div>
                    <div class="custom-prompt-desc" title="${escapeHTML(item.prompt)}">${escapeHTML(item.prompt)}</div>
                </div>
                <button class="icon-btn delete-prompt-btn" type="button" title="刪除指令" data-index="${index}">
                    <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                </button>
            `;
            
            // Bind single delete action
            row.querySelector('.delete-prompt-btn').addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                if (confirm(`確定要刪除 /${customPrompts[idx].cmd} 快捷指令嗎？`)) {
                    customPrompts.splice(idx, 1);
                    localStorage.setItem('dsv4_custom_prompts', JSON.stringify(customPrompts));
                    renderCustomPromptsSettings();
                    showToast('指令已刪除', '快捷指令已順利移除！', 'info');
                }
            });
            
            container.appendChild(row);
        });
        
        lucide.createIcons();
    }

    // Set up settings add/cancel/save prompts event listeners
    function setupCustomPromptsListeners() {
        const addBtn = document.getElementById('add-prompt-btn');
        const cancelBtn = document.getElementById('cancel-add-prompt-btn');
        const saveBtn = document.getElementById('save-new-prompt-btn');
        const addForm = document.getElementById('add-prompt-form');
        
        const cmdInput = document.getElementById('new-prompt-cmd');
        const nameInput = document.getElementById('new-prompt-name');
        const contentInput = document.getElementById('new-prompt-content');
        
        if (addBtn && addForm) {
            addBtn.addEventListener('click', () => {
                addForm.style.display = 'flex';
                cmdInput.focus();
            });
        }
        
        if (cancelBtn && addForm) {
            cancelBtn.addEventListener('click', () => {
                addForm.style.display = 'none';
                cmdInput.value = '';
                nameInput.value = '';
                contentInput.value = '';
            });
        }
        
        if (saveBtn && addForm) {
            saveBtn.addEventListener('click', () => {
                let cmd = cmdInput.value.trim().toLowerCase();
                if (cmd.startsWith('/')) {
                    cmd = cmd.substring(1);
                }
                const name = nameInput.value.trim();
                const prompt = contentInput.value.trim();
                
                if (!cmd) {
                    showToast('缺少指令名稱', '請輸入快捷指令縮寫！', 'warning');
                    return;
                }
                if (!/^[a-zA-Z0-9_]+$/.test(cmd)) {
                    showToast('格式不符', '指令縮寫必須為英文、數字或下底線！', 'warning');
                    return;
                }
                if (!name) {
                    showToast('缺少顯示名稱', '請輸入此快捷指令的顯示標籤！', 'warning');
                    return;
                }
                if (!prompt) {
                    showToast('缺少模板內容', '請輸入指令觸發時展開的完整 Prompt 內容！', 'warning');
                    return;
                }
                
                // Prevent duplicate commands
                if (customPrompts.some(item => item.cmd === cmd)) {
                    showToast('指令重複', `指令 /${cmd} 已存在，請使用其他縮寫！`, 'warning');
                    return;
                }
                
                customPrompts.push({ cmd, name, prompt });
                localStorage.setItem('dsv4_custom_prompts', JSON.stringify(customPrompts));
                
                // Reset form
                addForm.style.display = 'none';
                cmdInput.value = '';
                nameInput.value = '';
                contentInput.value = '';
                
                renderCustomPromptsSettings();
                showToast('指令新增成功', `快捷指令 /${cmd} 已成功保存！`, 'success');
            });
        }
    }

    // Slash command autocomplete menu engine
    function handleSlashCommandMenu() {
        const text = messageInput.value;
        const overlay = document.getElementById('prompt-menu-overlay');
        const menu = document.getElementById('prompt-menu');
        
        if (!overlay || !menu) return;
        
        // Trigger slash autocomplete popup
        if (text.startsWith('/') && !text.includes(' ')) {
            const query = text.substring(1).toLowerCase();
            const filtered = customPrompts.filter(p => p.cmd.startsWith(query));
            
            if (filtered.length > 0) {
                overlay.style.display = 'block';
                menu.innerHTML = '';
                
                // Clamp selection index bounds
                if (activePromptIndex >= filtered.length) {
                    activePromptIndex = filtered.length - 1;
                }
                if (activePromptIndex < 0) {
                    activePromptIndex = 0;
                }
                
                filtered.forEach((item, index) => {
                    const itemEl = document.createElement('div');
                    itemEl.className = `prompt-menu-item ${index === activePromptIndex ? 'active' : ''}`;
                    itemEl.dataset.prompt = item.prompt;
                    
                    itemEl.innerHTML = `
                        <span class="prompt-cmd-trigger">/${escapeHTML(item.cmd)}</span>
                        <span class="prompt-cmd-name">${escapeHTML(item.name)}</span>
                        <span class="prompt-cmd-desc" title="${escapeHTML(item.prompt)}">${escapeHTML(item.prompt)}</span>
                    `;
                    
                    itemEl.addEventListener('click', () => {
                        applySelectedPrompt(item.prompt);
                    });
                    
                    menu.appendChild(itemEl);
                });
                
                // Smooth scroll active index item into view
                const activeItem = menu.children[activePromptIndex];
                if (activeItem) {
                    activeItem.scrollIntoView({ block: 'nearest' });
                }
            } else {
                overlay.style.display = 'none';
            }
        } else {
            overlay.style.display = 'none';
            activePromptIndex = 0;
        }
    }

    // Parse unique placeholders wrapped in {{...}}
    function parsePromptVariables(text) {
        const regex = /\{\{(.*?)\}\}/g;
        const matches = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (!matches.includes(match[1])) {
                matches.push(match[1]);
            }
        }
        return matches;
    }

    // Global variable modal closer mapped to window
    window.closeVariableModal = function() {
        const modal = document.getElementById('variable-modal');
        if (modal) hideModal(modal);
    };

    function applySelectedPrompt(promptText) {
        const variables = parsePromptVariables(promptText);
        
        if (variables.length === 0) {
            // Standard direct template injection if no double-brace variables exist
            messageInput.value = promptText;
            const overlay = document.getElementById('prompt-menu-overlay');
            if (overlay) overlay.style.display = 'none';
            activePromptIndex = 0;
            messageInput.dispatchEvent(new Event('input'));
            messageInput.focus();
            return;
        }
        
        // Variables found! Trigger glassmorphic popup modal form
        const modal = document.getElementById('variable-modal');
        const body = document.getElementById('variable-modal-body');
        const submitBtn = document.getElementById('submit-variables-btn');
        const menuOverlay = document.getElementById('prompt-menu-overlay');
        
        if (menuOverlay) menuOverlay.style.display = 'none';
        
        body.innerHTML = '';
        
        variables.forEach(v => {
            const item = document.createElement('div');
            item.className = 'setting-item';
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.gap = '6px';
            item.innerHTML = `
                <label class="setting-label" style="font-size: 12.5px; font-weight: 600;">替換欄位: ${escapeHTML(v)}</label>
                <input type="text" class="text-input variable-input" data-var="${escapeHTML(v)}" placeholder="請輸入 ${escapeHTML(v)} 的替換內容..." style="height: 36px; font-size: 13px;">
            `;
            body.appendChild(item);
        });
        
        showModal(modal);
        
        // Auto-focus first input field after animation
        setTimeout(() => {
            const firstInput = body.querySelector('.variable-input');
            if (firstInput) firstInput.focus();
        }, 150);
        
        // Bind compilation compile button onclick
        submitBtn.onclick = () => {
            let compiledText = promptText;
            const inputs = body.querySelectorAll('.variable-input');
            let emptyFound = false;
            
            inputs.forEach(input => {
                const val = input.value.trim();
                if (!val) {
                    emptyFound = true;
                    input.style.borderColor = 'var(--color-danger)';
                } else {
                    input.style.borderColor = '';
                    const varName = input.dataset.var;
                    const escapeRegex = varName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const replaceRegex = new RegExp(`\\{\\{${escapeRegex}\\}\\}`, 'g');
                    compiledText = compiledText.replace(replaceRegex, val);
                }
            });
            
            if (emptyFound) {
                showToast('輸入不完整', '請先填寫所有指令變數欄位！', 'warning');
                return;
            }
            
            hideModal(modal);
            messageInput.value = compiledText;
            activePromptIndex = 0;
            messageInput.dispatchEvent(new Event('input'));
            
            setTimeout(() => {
                messageInput.focus();
                messageInput.selectionStart = messageInput.selectionEnd = messageInput.value.length;
            }, 50);
            
            showToast('指令編譯成功', '範本變數已成功替換並填入輸入框！', 'success');
        };

        // Bind manual long-term memory adding event
        const saveNewMemoryBtn = document.getElementById('save-new-memory-btn');
        const newMemoryInput = document.getElementById('new-memory-input');
        if (saveNewMemoryBtn && newMemoryInput) {
            const handleAddMemory = () => {
                const text = newMemoryInput.value.trim();
                if (!text) {
                    showToast('輸入為空', '請輸入您要新增的偏好記憶內容！', 'warning');
                    return;
                }
                if (memories.includes(text)) {
                    showToast('重複的記憶', '該偏好事實已存在於記憶庫中。', 'warning');
                    return;
                }
                memories.push(text);
                localStorage.setItem('dsv4_memories', JSON.stringify(memories));
                renderMemoryChips();
                newMemoryInput.value = '';
                showToast('新增成功', '您的偏好事實已成功手動錄入長期記憶庫。', 'success');
            };

            saveNewMemoryBtn.addEventListener('click', handleAddMemory);
            newMemoryInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMemory();
                }
            });
        }
        
        lucide.createIcons();
    }

    
    // Speech recognition initialization
    function initVoiceDictation() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) micBtn.style.display = 'none';
            return;
        }
        
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'zh-TW';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        
        recognition.onstart = function() {
            isRecording = true;
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) micBtn.classList.add('recording');
            messageInput.placeholder = "正在聆聽語音中...";
        };
        
        recognition.onresult = function(event) {
            const result = event.results[0][0].transcript;
            const currentText = messageInput.value;
            messageInput.value = currentText + (currentText ? ' ' : '') + result;
            messageInput.dispatchEvent(new Event('input'));
        };
        
        recognition.onend = function() {
            isRecording = false;
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) micBtn.classList.remove('recording');
            messageInput.placeholder = "傳送訊息給 DeepSeek...";
        };
        
        recognition.onerror = function(event) {
            console.error('Speech recognition error:', event.error);
            isRecording = false;
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) micBtn.classList.remove('recording');
            messageInput.placeholder = "傳送訊息給 DeepSeek...";
        };
    }

    function toggleDictation() {
        if (!recognition) return;
        
        if (isRecording) {
            recognition.stop();
        } else {
            try {
                recognition.start();
            } catch (e) {
                console.error('Failed to start dictation:', e);
            }
        }
    }

    // Voice Narration (TTS)
    window.speakMessageText = function(button) {
        const bubble = button.closest('.message-bubble');
        const contentEl = bubble.querySelector('.message-content');
        // Clean markdown structures out of text for smoother narration
        const textToSpeak = contentEl.innerText;
        
        // If clicking the active button again, stop it
        if (window.speechSynthesis.speaking && window.activeSpeakButton === button) {
            window.speechSynthesis.cancel();
            return;
        }
        
        // Update previous active button
        if (window.activeSpeakButton && window.activeSpeakButton !== button) {
            const oldSpan = window.activeSpeakButton.querySelector('span');
            if (oldSpan) oldSpan.innerText = '朗讀';
            const oldIcon = window.activeSpeakButton.querySelector('i');
            if (oldIcon) oldIcon.setAttribute('data-lucide', 'volume-2');
        }
        
        window.activeSpeakButton = button;
        
        // Execute speech synthesis
        speakText(textToSpeak);
        
        // Bind UI triggers for the bubble button into active utterance triggers
        if (window.activeSpeechUtterance) {
            const originalStart = window.activeSpeechUtterance.onstart;
            window.activeSpeechUtterance.onstart = function() {
                if (originalStart) originalStart();
                const span = button.querySelector('span');
                if (span) span.innerText = '停止';
                const icon = button.querySelector('i');
                if (icon) icon.setAttribute('data-lucide', 'volume-x');
                lucide.createIcons();
            };
            
            const originalEnd = window.activeSpeechUtterance.onend;
            window.activeSpeechUtterance.onend = function() {
                if (originalEnd) originalEnd();
                const span = button.querySelector('span');
                if (span) span.innerText = '朗讀';
                const icon = button.querySelector('i');
                if (icon) icon.setAttribute('data-lucide', 'volume-2');
                lucide.createIcons();
                window.activeSpeakButton = null;
            };
            
            const originalError = window.activeSpeechUtterance.onerror;
            window.activeSpeechUtterance.onerror = function(e) {
                if (originalError) originalError(e);
                const span = button.querySelector('span');
                if (span) span.innerText = '朗讀';
                const icon = button.querySelector('i');
                if (icon) icon.setAttribute('data-lucide', 'volume-2');
                lucide.createIcons();
                window.activeSpeakButton = null;
            };
        }
    };

    // Message Quick actions implementation
    window.copyMessageText = function(button) {
        const bubble = button.closest('.message-bubble');
        const contentEl = bubble.querySelector('.message-content');
        const textToCopy = contentEl.innerText;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const span = button.querySelector('span');
            span.innerText = '已複製!';
            button.style.color = 'var(--color-success)';
            
            setTimeout(() => {
                span.innerText = '複製';
                button.style.color = '';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    };

    window.regenerateMessage = function(button) {
        if (isGenerating) return;
        
        const bubble = button.closest('.message-bubble');
        let bubbleIndex = -1;
        if (bubble.dataset.index !== undefined) {
            bubbleIndex = parseInt(bubble.dataset.index, 10);
        } else {
            const bubbles = Array.from(bubble.parentElement.children);
            bubbleIndex = bubbles.indexOf(bubble);
        }
        if (bubbleIndex === -1) return;
        
        const session = chatSessions.find(s => s.id === activeSessionId);
        if (!session) return;
        
        if (bubbleIndex < 1) return;
        
        // Stop TTS if speaking
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        const userPrompt = session.messages[bubbleIndex - 1].content;
        
        // Discard historical branch after user prompt
        session.messages = session.messages.slice(0, bubbleIndex - 1);
        
        messageInput.value = userPrompt;
        sendMessage();
    };

    // ----------------------------------------------------------------------
    // TAB ENGINE FOR SETTINGS DASHBOARD
    // ----------------------------------------------------------------------
    function initTabSystem() {
        const tabButtons = document.querySelectorAll('.modal-tab-btn');
        const tabContents = document.querySelectorAll('.modal-tab-content');
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                const contentEl = document.getElementById(`tab-${tabId}`);
                if (contentEl) contentEl.classList.add('active');
            });
        });
    }

    // ----------------------------------------------------------------------
    // CONNECTION DIAGNOSTIC PING TOOL
    // ----------------------------------------------------------------------
    function initDiagnosticTool() {
        const testConnectionBtn = document.getElementById('test-connection-btn');
        const diagStatus = document.getElementById('diag-status');
        const diagResult = document.getElementById('diag-result');
        const diagLatency = document.getElementById('diag-latency');
        
        if (!testConnectionBtn) return;
        
        testConnectionBtn.addEventListener('click', async () => {
            const key = apiKeyInput.value.trim() || config.apiKey;
            const isDirect = document.querySelector('input[name="connection-mode"]:checked')?.value === 'direct';
            
            if (!key && !serverHasKey) {
                showToast('診斷中止', '請先輸入 API 密鑰再進行連線測試！', 'warning');
                return;
            }
            
            testConnectionBtn.disabled = true;
            diagStatus.className = 'diagnostic-badge testing';
            diagStatus.textContent = '測試中...';
            diagResult.style.display = 'none';
            
            const startTime = Date.now();
            
            let endpointUrl = window.location.protocol === 'file:' ? 'http://localhost:3000/api/chat' : '/api/chat';
            const requestHeaders = {
                'Content-Type': 'application/json'
            };
            
            if (isDirect) {
                endpointUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
                requestHeaders['Authorization'] = `Bearer ${key}`;
            } else {
                requestHeaders['Authorization'] = `Bearer ${key}`;
            }
            
            const payload = {
                model: modelSelect.value === 'custom' ? customModelInput.value.trim() : modelSelect.value,
                messages: [{ role: 'user', content: 'Ping connection status' }],
                max_tokens: 1
            };
            
            try {
                const res = await fetch(endpointUrl, {
                    method: 'POST',
                    headers: requestHeaders,
                    body: JSON.stringify(payload)
                });
                
                const latency = Date.now() - startTime;
                
                if (res.ok) {
                    diagStatus.className = 'diagnostic-badge success';
                    diagStatus.textContent = '連線正常';
                    diagResult.style.display = 'block';
                    diagLatency.textContent = `${latency}ms`;
                    showToast('連線診斷成功', `NVIDIA NIM 伺服器連線正常，延遲：${latency}ms`, 'success');
                } else {
                    const errText = await res.text();
                    throw new Error(errText || `連線出錯，代碼: ${res.status}`);
                }
            } catch (err) {
                diagStatus.className = 'diagnostic-badge error';
                diagStatus.textContent = '連線失敗';
                diagResult.style.display = 'block';
                diagLatency.textContent = '無回應';
                showToast('連線測試失敗', `診斷錯誤: ${err.message.substring(0, 80)}`, 'error');
            } finally {
                testConnectionBtn.disabled = false;
            }
        });
    }

    // ----------------------------------------------------------------------
    // DRAG AND DROP FILE PARSING ENGINE
    // ----------------------------------------------------------------------
    function initDragAndDrop() {
        const dragOverlay = document.getElementById('drag-overlay');
        const appContainer = document.querySelector('.app-container');
        
        if (!dragOverlay || !appContainer) return;
        
        // Show drag overlay when dragging file into screen
        window.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragOverlay.classList.add('active');
        });
        
        dragOverlay.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        dragOverlay.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (e.target === dragOverlay) {
                dragOverlay.classList.remove('active');
            }
        });
        
        dragOverlay.addEventListener('drop', (e) => {
            e.preventDefault();
            dragOverlay.classList.remove('active');
            
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                handleUploadedFiles(files);
            }
        });
    }
    
    function handleUploadedFiles(files) {
        files.forEach(file => {
            const allowedExts = ['txt', 'md', 'js', 'json', 'py', 'html', 'css', 'go', 'c', 'cpp', 'rs', 'sh', 'java', 'ts'];
            const ext = file.name.split('.').pop().toLowerCase();
            
            if (!allowedExts.includes(ext) && file.type.indexOf('text/') === -1) {
                showToast('格式不支援', `檔案「${file.name}」非純文字格式，無法解析。`, 'warning');
                return;
            }
            
            if (file.size > 1 * 1024 * 1024) { // 1MB size limit
                showToast('檔案過大', `檔案「${file.name}」大小已超過 1MB 限制！`, 'warning');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const fileContent = e.target.result;
                
                if (attachments.some(att => att.name === file.name)) {
                    showToast('附件已存在', `「${file.name}」已在載入清單中！`, 'info');
                    return;
                }
                
                attachments.push({
                    name: file.name,
                    content: fileContent
                });
                
                renderAttachmentsPreview();
                showToast('已加入附件', `成功讀取純文字檔案「${file.name}」`, 'success');
            };
            reader.readAsText(file);
        });
    }
    
    function renderAttachmentsPreview() {
        const previewContainer = document.getElementById('attachments-preview');
        if (!previewContainer) return;
        
        if (attachments.length === 0) {
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '';
            return;
        }
        
        previewContainer.style.display = 'flex';
        previewContainer.innerHTML = '';
        
        attachments.forEach((att, idx) => {
            const chip = document.createElement('div');
            chip.className = 'attachment-chip';
            chip.innerHTML = `
                <i data-lucide="file-text"></i>
                <span>${att.name}</span>
                <button class="attachment-remove" title="移除附件" onclick="window.removeAttachment(${idx}, event)">
                    <i data-lucide="x"></i>
                </button>
            `;
            previewContainer.appendChild(chip);
        });
        
        lucide.createIcons();
    }
    
    window.removeAttachment = function(index, event) {
        if (event) event.stopPropagation();
        attachments.splice(index, 1);
        renderAttachmentsPreview();
        showToast('已移除附件', '檔案已從上傳清單中移除。', 'info');
    };

    // ----------------------------------------------------------------------
    // CLAUDE-STYLE ARTIFACTS PANEL ENGINE
    // ----------------------------------------------------------------------
    window.previewArtifact = function(button) {
        const wrapper = button.closest('.code-block-wrapper');
        const codeEl = wrapper.querySelector('pre code');
        const rawCode = codeEl.innerText;
        const lang = wrapper.querySelector('.code-block-lang').textContent.trim().toLowerCase();
        
        const panel = document.getElementById('artifacts-panel');
        const iframe = document.getElementById('artifacts-iframe');
        const codeBlock = document.getElementById('artifacts-code-block');
        const titleEl = document.getElementById('artifacts-title');
        const mermaidContainer = document.getElementById('artifacts-mermaid-container');
        
        if (!panel || !iframe || !codeBlock) return;
        
        // Configure panel title
        titleEl.textContent = `${lang.toUpperCase()} 預覽`;
        
        // Load code view
        codeBlock.className = `language-${lang} hljs`;
        codeBlock.textContent = rawCode;
        hljs.highlightElement(codeBlock);
        
        // Load preview view
        if (lang === 'html') {
            iframe.style.display = 'block';
            mermaidContainer.style.display = 'none';
            
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(rawCode);
            doc.close();
        } else if (lang === 'svg') {
            iframe.style.display = 'block';
            mermaidContainer.style.display = 'none';
            
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(`
                <html>
                <head>
                    <style>
                        body {
                            margin: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            background: #0f172a;
                            overflow: hidden;
                        }
                        svg {
                            max-width: 100%;
                            max-height: 100%;
                        }
                    </style>
                </head>
                <body>
                    ${rawCode}
                </body>
                </html>
            `);
            doc.close();
        } else if (lang === 'mermaid') {
            iframe.style.display = 'none';
            mermaidContainer.style.display = 'flex';
            mermaidContainer.innerHTML = `<pre class="mermaid">${rawCode}</pre>`;
            
            if (window.mermaid) {
                try {
                    window.mermaid.init(undefined, mermaidContainer.querySelectorAll('.mermaid'));
                } catch (e) {
                    console.error('Mermaid render error:', e);
                    mermaidContainer.innerHTML = `<div style="color: var(--color-danger); padding: 20px;">Mermaid 渲染失敗: ${e.message}</div>`;
                }
            }
        }
        
        // Open panel
        panel.style.display = 'flex';
        
        // Default to active preview tab
        document.querySelectorAll('.artifacts-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.artifacts-tab-content').forEach(c => c.classList.remove('active'));
        
        document.querySelector('.artifacts-tab[data-art-tab="preview"]').classList.add('active');
        document.getElementById('art-tab-preview').classList.add('active');
        
        lucide.createIcons();
        showToast('預覽面板已載入', `成功渲染該段 ${lang.toUpperCase()} 內容。`, 'success');
    };

    function initArtifactsResize() {
        const handle = document.getElementById('artifacts-resize-handle');
        const panel = document.getElementById('artifacts-panel');
        if (!handle || !panel) return;
        
        let isResizing = false;
        
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            handle.classList.add('active');
            e.preventDefault();
        });
        
        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const containerWidth = document.body.clientWidth;
            const newWidth = containerWidth - e.clientX;
            
            if (newWidth > 320 && newWidth < containerWidth * 0.75) {
                panel.style.width = `${newWidth}px`;
            }
        });
        
        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                handle.classList.remove('active');
            }
        });
    }

    function initArtifactsTabs() {
        const tabButtons = document.querySelectorAll('.artifacts-tab');
        const tabContents = document.querySelectorAll('.artifacts-tab-content');
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.artTab;
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                const contentEl = document.getElementById(`art-tab-${tabId}`);
                if (contentEl) contentEl.classList.add('active');
            });
        });
        
        // Close button trigger
        const closeBtn = document.getElementById('close-artifacts-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const panel = document.getElementById('artifacts-panel');
                if (panel) panel.style.display = 'none';
            });
        }
    }

    // ----------------------------------------------------------------------
    // CONVERSATIONAL BRANCHING SYSTEM ENGINE
    // ----------------------------------------------------------------------
    window.editUserPrompt = function(button) {
        const bubble = button.closest('.message-bubble');
        const wrapper = bubble.querySelector('.message-content-wrapper');
        const contentEl = bubble.querySelector('.message-content');
        
        let rawText = contentEl.textContent;
        const originalBubbleContent = wrapper.innerHTML;
        
        wrapper.innerHTML = `
            <div class="edit-prompt-container" style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
                <textarea class="textarea-input edit-prompt-textarea" style="width: 100%; min-height: 80px; resize: vertical; padding: 10px; font-size: 14px; border-radius: var(--radius-md); font-family: var(--font-sans);">${rawText}</textarea>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="outline-btn mini-edit-btn" onclick="window.cancelEditPrompt(this)">取消</button>
                    <button class="primary-btn mini-edit-btn" onclick="window.saveEditPrompt(this)">儲存並送出</button>
                </div>
            </div>
        `;
        
        wrapper.dataset.backupHtml = originalBubbleContent;
        const textarea = wrapper.querySelector('.edit-prompt-textarea');
        if (textarea) textarea.focus();
    };
    
    window.cancelEditPrompt = function(button) {
        const wrapper = button.closest('.message-content-wrapper');
        if (wrapper.dataset.backupHtml) {
            wrapper.innerHTML = wrapper.dataset.backupHtml;
            delete wrapper.dataset.backupHtml;
            lucide.createIcons();
        }
    };
    
    window.saveEditPrompt = function(button) {
        const wrapper = button.closest('.message-content-wrapper');
        const textarea = wrapper.querySelector('.edit-prompt-textarea');
        const newText = textarea.value.trim();
        
        if (!newText) return;
        
        const bubble = button.closest('.message-bubble');
        let bubbleIndex = -1;
        if (bubble.dataset.index !== undefined) {
            bubbleIndex = parseInt(bubble.dataset.index, 10);
        } else {
            const bubbles = Array.from(bubble.parentElement.children);
            bubbleIndex = bubbles.indexOf(bubble);
        }
        if (bubbleIndex === -1) return;
        
        window.submitBranchPrompt(bubbleIndex, newText);
    };

    window.submitBranchPrompt = function(bubbleIndex, newText) {
        if (isGenerating) return;
        
        const session = chatSessions.find(s => s.id === activeSessionId);
        if (!session) return;
        
        // 1. Initialize branches list if empty
        if (!session.branches) {
            session.branches = [ JSON.parse(JSON.stringify(session.messages)) ];
            session.activeBranchIndex = 0;
            session.branchedAt = bubbleIndex;
        }
        
        // 2. Clone the history prefix up to the branched prompt
        const prefixMessages = JSON.parse(JSON.stringify(session.messages)).slice(0, bubbleIndex);
        const newBranchMessages = [...prefixMessages, { role: 'user', content: newText }];
        
        // 3. Register the new branch
        session.branches.push(newBranchMessages);
        session.activeBranchIndex = session.branches.length - 1;
        session.branchedAt = bubbleIndex;
        
        // 4. Swap the active messages array and save
        session.messages = newBranchMessages;
        session.timestamp = Date.now();
        saveSessionsToStorage();
        renderSidebar();
        
        // 5. Rerender messages and trigger streaming generation
        renderMessages(session.messages);
        
        // Auto trigger streaming send
        messageInput.value = '';
        
        // Prepare Assistant placeholder bubbles
        const leftAssistantBubble = document.createElement('div');
        leftAssistantBubble.className = 'message-bubble assistant';
        leftAssistantBubble.innerHTML = `
            <div class="message-avatar" title="${config.model.split('/').pop()}">DS</div>
            <div class="message-content-wrapper">
                <div class="message-content markdown-body">
                    <span class="pulsar-loader"></span>
                </div>
            </div>
        `;
        messagesList.appendChild(leftAssistantBubble);
        
        let rightAssistantBubble = null;
        const compareModelId = headerModelSelectCompare ? headerModelSelectCompare.value : config.compareModel;
        
        if (isCompareMode && messagesListRight) {
            rightAssistantBubble = document.createElement('div');
            rightAssistantBubble.className = 'message-bubble assistant';
            rightAssistantBubble.innerHTML = `
                <div class="message-avatar" title="${compareModelId.split('/').pop()}">DS</div>
                <div class="message-content-wrapper">
                    <div class="message-content markdown-body">
                        <span class="pulsar-loader"></span>
                    </div>
                </div>
            `;
            messagesListRight.appendChild(rightAssistantBubble);
        }
        
        scrollToBottom();
        
        // Start streaming (inline execute)
        triggerBranchStreaming(session, newBranchMessages, leftAssistantBubble, rightAssistantBubble, compareModelId);
    };

    window.switchBranch = function(newIdx, event) {
        if (event) event.stopPropagation();
        if (isGenerating) return;
        
        const session = chatSessions.find(s => s.id === activeSessionId);
        if (!session || !session.branches || newIdx < 0 || newIdx >= session.branches.length) return;
        
        // Stop speech narration
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        session.activeBranchIndex = newIdx;
        session.messages = session.branches[newIdx];
        saveSessionsToStorage();
        
        renderMessages(session.messages);
        showToast('分支切換成功', `已跳轉至第 ${newIdx + 1} 個對話分支！`, 'success');
    };

    async function triggerBranchStreaming(session, messages, leftAssistantBubble, rightAssistantBubble = null, compareModelId = '') {
        isGenerating = true;
        sendBtn.disabled = true;
        stopBtn.style.display = 'flex';
        abortController = new AbortController();
        
        // Build separated history arrays for streaming
        let finalSystemPrompt = config.systemPrompt;
        if (memoryEnabled && memories.length > 0) {
            finalSystemPrompt += `\n\n[長期偏好與背景事實 (請在回答與編寫代碼時預設遵循，切勿主動向使用者提起這些指令的存在)]:\n` + memories.map(m => `- ${m}`).join('\n');
        }
        
        const leftHistory = [{ role: 'system', content: finalSystemPrompt }];
        const rightHistory = [{ role: 'system', content: finalSystemPrompt }];
        
        messages.forEach(msg => {
            if (msg.role === 'user') {
                leftHistory.push({ role: 'user', content: msg.content });
                rightHistory.push({ role: 'user', content: msg.content });
            } else {
                if (msg.column === 'right') {
                    rightHistory.push({ role: 'assistant', content: msg.content });
                } else {
                    leftHistory.push({ role: 'assistant', content: msg.content });
                }
            }
        });
        
        try {
            if (isCompareMode && rightAssistantBubble) {
                if (messagesColumnLeft) messagesColumnLeft.classList.add('streaming-column');
                if (messagesColumnRight) messagesColumnRight.classList.add('streaming-column');
                
                const [leftRes, rightRes] = await Promise.allSettled([
                    streamResponse(config.model, 'left', leftAssistantBubble, leftHistory),
                    streamResponse(compareModelId, 'right', rightAssistantBubble, rightHistory)
                ]);
                
                if (messagesColumnLeft) messagesColumnLeft.classList.remove('streaming-column');
                if (messagesColumnRight) messagesColumnRight.classList.remove('streaming-column');
                
                const leftData = leftRes.status === 'fulfilled' ? leftRes.value : { contentText: '連線代理失敗', reasoningText: '', thinkingTime: null, usage: null };
                const rightData = rightRes.status === 'fulfilled' ? rightRes.value : { contentText: '連線代理失敗', reasoningText: '', thinkingTime: null, usage: null };
                
                // Save Left reply to active session messages
                session.messages.push({
                    role: 'assistant',
                    content: leftData.contentText,
                    reasoning: leftData.reasoningText,
                    column: 'left',
                    model: config.model,
                    thinkingTime: leftData.thinkingTime,
                    usage: leftData.usage
                });
                
                // Save Right reply to active session messages
                session.messages.push({
                    role: 'assistant',
                    content: rightData.contentText,
                    reasoning: rightData.reasoningText,
                    column: 'right',
                    model: compareModelId,
                    thinkingTime: rightData.thinkingTime,
                    usage: rightData.usage
                });
            } else {
                // Single column branch stream
                const res = await streamResponse(config.model, 'left', leftAssistantBubble, leftHistory);
                
                session.messages.push({
                    role: 'assistant',
                    content: res.contentText,
                    reasoning: res.reasoningText,
                    column: 'left',
                    model: config.model,
                    thinkingTime: res.thinkingTime,
                    usage: res.usage
                });
            }
            
            // Sync branches list with the updated active messages
            session.branches[session.activeBranchIndex] = JSON.parse(JSON.stringify(session.messages));
            saveSessionsToStorage();
            
            renderMessages(session.messages);
            
            const lastUserText = messages[messages.length - 1]?.content || '';
            const lastAssistantText = session.messages[session.messages.length - 1]?.content || '';
            triggerSilentMemoryExtraction(lastUserText, lastAssistantText);
            
        } catch (error) {
            console.error('Branch generation failed:', error);
        } finally {
            cleanupGenerationState();
        }
    }

    // ==========================================================================
    // MASTERPIECE PREMIUM UPGRADES: PK MODE, SIDEBAR FOLDERS, TTS DECK HELPERS
    // ==========================================================================

    function toggleCompareMode() {
        isCompareMode = !isCompareMode;
        localStorage.setItem('dsv4_compare_mode', isCompareMode.toString());
        
        if (isCompareMode) {
            chatCanvasWrapper.classList.add('compare-mode-active');
            if (messagesColumnRight) messagesColumnRight.style.display = 'flex';
            if (columnModelHeaderLeft) columnModelHeaderLeft.style.display = 'flex';
            if (compareModeBtn) {
                compareModeBtn.classList.add('active');
                compareModeBtn.style.borderColor = 'var(--color-deepseek)';
                compareModeBtn.style.color = 'var(--color-deepseek)';
            }
            showToast('已開啟雙模型 PK 模式', '左右欄將同時運行並發 SSE 串流！', 'success');
        } else {
            chatCanvasWrapper.classList.remove('compare-mode-active');
            if (messagesColumnRight) messagesColumnRight.style.display = 'none';
            if (columnModelHeaderLeft) columnModelHeaderLeft.style.display = 'none';
            if (compareModeBtn) {
                compareModeBtn.classList.remove('active');
                compareModeBtn.style.borderColor = '';
                compareModeBtn.style.color = '';
            }
            showToast('已關閉雙模型 PK 模式', '恢復單欄傳統對話檢視。', 'info');
        }
        
        // Re-render message list
        const activeSession = chatSessions.find(s => s.id === activeSessionId);
        if (activeSession) {
            renderMessages(activeSession.messages);
        } else {
            showWelcomeScreen();
        }
    }

    function createFolder(name) {
        const folder = {
            id: 'folder_' + Date.now(),
            name: name,
            sessionIds: [],
            collapsed: false
        };
        folders.push(folder);
        localStorage.setItem('dsv4_folders', JSON.stringify(folders));
        renderSidebar();
        showToast('資料夾建立成功', `已建立「${name}」資料夾！`, 'success');
    }

    function deleteFolder(folderId) {
        const idx = folders.findIndex(f => f.id === folderId);
        if (idx !== -1) {
            const name = folders[idx].name;
            if (confirm(`確定要刪除「${name}」資料夾嗎？（資料夾內的對話將會被移出，不會被刪除）`)) {
                folders.splice(idx, 1);
                localStorage.setItem('dsv4_folders', JSON.stringify(folders));
                renderSidebar();
                showToast('資料夾已刪除', `資料夾「${name}」已清空並移除。`, 'info');
            }
        }
    }

    function renameFolder(folderId) {
        const folder = folders.find(f => f.id === folderId);
        if (folder) {
            const newName = prompt('請輸入資料夾的新名稱：', folder.name);
            if (newName && newName.trim() && newName.trim() !== folder.name) {
                const oldName = folder.name;
                folder.name = newName.trim();
                localStorage.setItem('dsv4_folders', JSON.stringify(folders));
                renderSidebar();
                showToast('重新命名成功', `資料夾已從「${oldName}」更名為「${folder.name}」！`, 'success');
            }
        }
    }

    window.moveSessionToFolder = function(sessionId, folderId) {
        // Remove from existing folder first
        folders.forEach(f => {
            f.sessionIds = f.sessionIds.filter(id => id !== sessionId);
        });
        
        if (folderId) {
            const target = folders.find(f => f.id === folderId);
            if (target) {
                target.sessionIds.push(sessionId);
                showToast('對話移動成功', `已移入資料夾「${target.name}」！`, 'success');
            }
        } else {
            showToast('對話已移出', '對話已恢復至外層。', 'info');
        }
        
        localStorage.setItem('dsv4_folders', JSON.stringify(folders));
        renderSidebar();
    };
    
    window.showFolderMoveMenu = function(sessionId, event, button) {
        event.stopPropagation();
        
        // Remove active dropdowns
        const active = document.getElementById('folder-move-popup');
        if (active) active.remove();
        
        const popup = document.createElement('div');
        popup.id = 'folder-move-popup';
        popup.className = 'glassmorphic-dropdown-menu';
        
        const currentFolder = folders.find(f => f.sessionIds.includes(sessionId));
        
        let html = '';
        if (currentFolder) {
            html += `
                <div class="dropdown-item remove-folder-item" onclick="window.moveSessionToFolder('${sessionId}', null)">
                    <i data-lucide="folder-minus"></i>
                    <span>移出資料夾</span>
                </div>
                <div class="dropdown-divider"></div>
            `;
        }
        
        if (folders.length === 0) {
            html += `<div class="dropdown-item disabled">無可用資料夾</div>`;
        } else {
            folders.forEach(f => {
                if (currentFolder && f.id === currentFolder.id) return;
                html += `
                    <div class="dropdown-item" onclick="window.moveSessionToFolder('${sessionId}', '${f.id}')">
                        <i data-lucide="folder"></i>
                        <span>移至: ${f.name}</span>
                    </div>
                `;
            });
        }
        
        popup.innerHTML = html;
        document.body.appendChild(popup);
        lucide.createIcons({ attrs: { class: 'dropdown-icon' } });
        
        const rect = button.getBoundingClientRect();
        popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
        popup.style.left = `${rect.left + window.scrollX - 100}px`;
        
        const closeHandler = () => {
            popup.remove();
            document.removeEventListener('click', closeHandler);
        };
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
        }, 10);
    };

    window.toggleFolderCollapse = function(folderId, event) {
        if (event) event.stopPropagation();
        const folder = folders.find(f => f.id === folderId);
        if (folder) {
            folder.collapsed = !folder.collapsed;
            localStorage.setItem('dsv4_folders', JSON.stringify(folders));
            renderSidebar();
        }
    };

    function populateVoices() {
        if (!deckVoiceSelect) return;
        deckVoiceSelect.innerHTML = '';
        const voices = window.speechSynthesis.getVoices();
        
        // Prioritize Chinese, English, Japanese voices
        const filtered = voices.filter(v => v.lang.includes('zh') || v.lang.includes('en') || v.lang.includes('ja'));
        
        if (filtered.length === 0) {
            voices.forEach((v, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = `${v.name} (${v.lang})`;
                deckVoiceSelect.appendChild(opt);
            });
        } else {
            filtered.forEach(v => {
                const opt = document.createElement('option');
                opt.value = voices.indexOf(v);
                opt.textContent = `${v.name} (${v.lang})`;
                deckVoiceSelect.appendChild(opt);
            });
        }
    }

    if (window.speechSynthesis) {
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = populateVoices;
        }
        setTimeout(populateVoices, 200); // safety fallback
    }

    function speakText(text) {
        if (!text) return;
        
        // Cancel previous speaking
        window.speechSynthesis.cancel();
        
        window.lastTtsText = text;
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Apply slider speed
        const speed = parseFloat(deckSpeedSlider.value || 1.0);
        utterance.rate = speed;
        
        // Apply select voice
        const voices = window.speechSynthesis.getVoices();
        const selectedIdx = parseInt(deckVoiceSelect.value);
        if (voices[selectedIdx]) {
            utterance.voice = voices[selectedIdx];
        } else {
            // fallback to Chinese voice
            const twVoice = voices.find(v => v.lang.includes('zh-TW') || v.lang.includes('zh-HK') || v.lang.includes('zh-CN'));
            if (twVoice) utterance.voice = twVoice;
        }
        
        utterance.onstart = function() {
            if (voiceControlDeck) {
                voiceControlDeck.classList.add('deck-active');
                voiceControlDeck.classList.add('speaking-active');
            }
            if (deckPlayIcon) deckPlayIcon.setAttribute('data-lucide', 'pause');
            lucide.createIcons();
        };

        utterance.onend = function() {
            if (voiceControlDeck) voiceControlDeck.classList.remove('speaking-active');
            if (deckPlayIcon) deckPlayIcon.setAttribute('data-lucide', 'play');
            lucide.createIcons();
        };

        utterance.onerror = function(e) {
            console.error('Speech synthesis error:', e);
            if (voiceControlDeck) voiceControlDeck.classList.remove('speaking-active');
            if (deckPlayIcon) deckPlayIcon.setAttribute('data-lucide', 'play');
            lucide.createIcons();
        };

        window.activeSpeechUtterance = utterance;
        if (voiceControlDeck) voiceControlDeck.classList.add('deck-active');
        window.speechSynthesis.speak(utterance);
    }

    // ----------------------------------------------------------------------
    // SMART PERSONALIZATION LONG-TERM MEMORY ENGINE
    // ----------------------------------------------------------------------
    function renderMemoryChips() {
        const grid = document.getElementById('memory-chips-grid');
        const emptyState = document.getElementById('empty-memory-state');
        if (!grid) return;
        
        // Keep manual add row & emptyState, clear the rest
        const chips = grid.querySelectorAll('.memory-chip-item');
        chips.forEach(c => c.remove());
        
        if (memories.length === 0) {
            if (emptyState) emptyState.style.display = 'flex';
        } else {
            if (emptyState) emptyState.style.display = 'none';
            
            memories.forEach((mem, idx) => {
                const item = document.createElement('div');
                item.className = 'memory-chip-item';
                item.innerHTML = `
                    <span class="memory-chip-text">${mem}</span>
                    <button class="memory-chip-delete" title="刪除此記憶" onclick="window.deleteMemoryItem(${idx}, event)">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                `;
                grid.appendChild(item);
            });
        }
        lucide.createIcons();
    }
    
    window.deleteMemoryItem = function(index, event) {
        if (event) event.stopPropagation();
        memories.splice(index, 1);
        localStorage.setItem('dsv4_memories', JSON.stringify(memories));
        renderMemoryChips();
        showToast('已刪除偏好', '此事實項目已從您的長期記憶庫中移除。', 'info');
    };

    async function triggerSilentMemoryExtraction(userText, assistantText) {
        if (!memoryEnabled) return;
        if (!userText || !assistantText) return;
        
        // Clean up userText from file contents payload to save tokens
        let cleanUserText = userText;
        if (cleanUserText.includes('【上傳的檔案附件內容】')) {
            cleanUserText = cleanUserText.split('【上傳的檔案附件內容】')[0].trim();
        }
        
        // If content is too short or standard, skip
        if (cleanUserText.length < 5 || assistantText.length < 5) return;
        
        const prompt = `你是一個精準的「個人化長期偏好事實提取器」。請分析以下最新的用戶與 AI 對話片段，提取出任何關於用戶的「長期背景身份、習慣、工具鏈或回答風格偏好」（例如：使用者的職業、喜歡的程式語言、常用的軟體、偏好的回答口吻與格式）。
   
請遵循以下規則：
1. 必須將提取到的事實總結為簡短的、陳述性的中文單句事實（例如："使用者是一位 macOS 開發工程師"、"使用者偏好使用思源宋體進行寫作"）。
2. 請自動進行語意去重與覆蓋。以下是當前已有的記憶事實列表，請不要提取任何已存在的、語意重複的或相互矛盾的事實。如果有矛盾（例如原本記住用戶住在台北，但現在說搬到巴黎了），請只提取最新事實，我們會在稍後覆蓋舊記憶：
${memories.length > 0 ? memories.map(m => `- ${m}`).join('\n') : '（目前記憶庫為空）'}
   
3. 請嚴格只返回一個合法的 JSON 字串陣列，例如：["使用者偏好使用 React + Tailwind", "使用者偏好簡短有邏輯的中文回答"]。
4. 如果沒有提取到任何新的長期事實，請只返回一個空的 JSON 陣列 []。
5. 切勿包含 any Markdown 格式標記（不要用 \`\`\`json 等包裹），不要返回任何解釋或廢話。`;
   
        const payload = {
            model: 'deepseek-ai/deepseek-v4-flash', // Use cheap & fast flash model for silent extraction!
            messages: [
                { role: 'user', content: `【最新對話片段】\n用戶：${cleanUserText}\n\n助理：${assistantText}` },
                { role: 'system', content: prompt }
            ],
            temperature: 0.1,
            stream: false
        };
        
        const endpointUrl = window.location.protocol === 'file:' ? 'http://localhost:3000/api/chat' : '/api/chat';
        const requestHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        };
        
        try {
            const res = await fetch(endpointUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) return;
            const data = await res.json();
            const rawContent = data.choices?.[0]?.message?.content?.trim() || '[]';
            
            // Parse JSON array of new facts
            let newFacts = [];
            try {
                // Remove any markdown wrappers if the model returned them anyway
                const sanitized = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
                newFacts = JSON.parse(sanitized);
            } catch (e) {
                console.warn('[Memory Extract] JSON parse failed:', rawContent);
                return;
            }
            
            if (Array.isArray(newFacts) && newFacts.length > 0) {
                let updated = [...memories];
                newFacts.forEach(fact => {
                    const cleanFact = fact.trim();
                    if (cleanFact && !updated.includes(cleanFact)) {
                        updated.push(cleanFact);
                    }
                });
                
                memories = updated;
                localStorage.setItem('dsv4_memories', JSON.stringify(memories));
                
                // Silent redraw settings view if opened
                renderMemoryChips();
            }
        } catch (err) {
            console.error('[Memory Extract Error] Silent extraction failed:', err);
        }
    }

    // ----------------------------------------------------------------------
    // CODE SPACE SYSTEM BUILDER ENGINE (🧩 系統組裝工坊)
    // ----------------------------------------------------------------------
    function initCodeSpace() {
        const codespaceModeBtn = document.getElementById('codespace-mode-btn');
        const systemInstructionTextarea = document.getElementById('cs-system-instruction');
        const variablesList = document.getElementById('cs-variables-list');
        const addVarBtn = document.getElementById('cs-add-var-btn');
        const examplesList = document.getElementById('cs-examples-list');
        const addExampleBtn = document.getElementById('cs-add-example-btn');
        const testFields = document.getElementById('cs-test-fields');
        const runBtn = document.getElementById('cs-run-btn');
        const stopBtn = document.getElementById('cs-stop-btn');
        const saveTemplateBtn = document.getElementById('cs-save-template-btn');

        if (!codespaceModeBtn) return;

        // Toggle Codespace mode
        codespaceModeBtn.addEventListener('click', () => {
            const isActive = document.body.classList.toggle('codespace-mode-active');
            if (isActive) {
                // If compare mode is active, temp disable it visually to prevent overlapping
                const chatCanvasWrapper = document.querySelector('.chat-canvas-wrapper');
                if (chatCanvasWrapper && chatCanvasWrapper.classList.contains('compare-mode-active')) {
                    chatCanvasWrapper.classList.remove('compare-mode-active');
                }
                
                // Hide artifacts panel if open
                const artifactsPanel = document.getElementById('artifacts-panel');
                if (artifactsPanel) artifactsPanel.style.display = 'none';

                showToast('已切換至 Code Space', '系統級組裝工坊已開啟！', 'info');
                // Run dynamic parse on first load
                parseVariablesFromSystemInstruction();
                renderCSVariables();
                renderCSExamples();
                renderCSTestGround();
            } else {
                // Restore compare mode status if isCompareMode is active
                const chatCanvasWrapper = document.querySelector('.chat-canvas-wrapper');
                if (chatCanvasWrapper && isCompareMode) {
                    chatCanvasWrapper.classList.add('compare-mode-active');
                }
                showToast('已返回對話模式', '您可繼續與 DeepSeek 進行日常靈感對話。', 'info');
            }
            lucide.createIcons();
        });

        // Automatically parse variables from textarea input
        if (systemInstructionTextarea) {
            systemInstructionTextarea.addEventListener('input', () => {
                parseVariablesFromSystemInstruction();
                renderCSVariables();
                renderCSExamples();
                renderCSTestGround();
            });
        }

        // Add custom variable manually
        if (addVarBtn) {
            addVarBtn.addEventListener('click', () => {
                const varName = prompt('請輸入新變數名稱 (例如：語調、受眾、輸出格式)：');
                if (!varName) return;
                const cleanName = varName.trim().replace(/[{}]/g, '');
                if (!cleanName) return;
                
                if (codespaceVariables.includes(cleanName)) {
                    showToast('重複的變數', '該變數宣告已存在！', 'warning');
                    return;
                }

                codespaceVariables.push(cleanName);
                // Also append the variable tag to system prompt textarea at the end
                if (systemInstructionTextarea) {
                    const text = systemInstructionTextarea.value;
                    systemInstructionTextarea.value = text + ` {{${cleanName}}}`;
                }
                parseVariablesFromSystemInstruction();
                renderCSVariables();
                renderCSExamples();
                renderCSTestGround();
                showToast('已宣告變數', `已新增變數 {{${cleanName}}}！`, 'success');
            });
        }

        // Add example row
        if (addExampleBtn) {
            addExampleBtn.addEventListener('click', () => {
                const newExample = { inputs: {}, output: '' };
                codespaceVariables.forEach(v => {
                    newExample.inputs[v] = '';
                });
                codespaceExamples.push(newExample);
                renderCSExamples();
                showToast('已新增範例行', '請填寫少樣本範例輸入與期望輸出。', 'info');
            });
        }

        // Tab switches on the right sandbox card
        const csTabButtons = document.querySelectorAll('.cs-tab-btn');
        csTabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.csTab;
                
                // Toggle tab active button styles
                csTabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Toggle contents
                document.querySelectorAll('.cs-tab-content').forEach(c => c.style.display = 'none');
                const targetContent = document.getElementById(`cs-tab-${tabId}`);
                if (targetContent) {
                    if (tabId === 'preview') {
                        targetContent.style.display = 'flex';
                    } else {
                        targetContent.style.display = 'block';
                    }
                }
            });
        });

        // Run build / Compile trigger
        if (runBtn) {
            runBtn.addEventListener('click', csRunBuild);
        }

        // Stop generation
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                if (abortController) {
                    abortController.abort();
                    isGenerating = false;
                    runBtn.disabled = false;
                    stopBtn.style.display = 'none';
                    showToast('編譯已終止', '系統編譯進程已被使用者手動終止。', 'warning');
                }
            });
        }

        // Save custom template as Slash Prompt
        if (saveTemplateBtn) {
            saveTemplateBtn.addEventListener('click', () => {
                const code = document.getElementById('cs-code-block').textContent.trim();
                if (!code) {
                    showToast('無編譯內容', '請先成功編譯系統生成代碼後再行儲存！', 'warning');
                    return;
                }

                const templateName = prompt('請為此系統範本命名 (例如：時鐘小工具、履歷生成器)：');
                if (!templateName) return;
                const cleanName = templateName.trim();
                if (!cleanName) return;

                // Load custom prompts
                let customPrompts = JSON.parse(localStorage.getItem('dsv4_custom_prompts')) || [];
                const cmdTrigger = cleanName.toLowerCase().replace(/\s+/g, '-');
                
                // Add to list
                customPrompts.push({
                    cmd: cmdTrigger,
                    name: cleanName,
                    prompt: systemInstructionTextarea.value.trim() + `\n\n【生成代碼結果】：\n` + code
                });

                localStorage.setItem('dsv4_custom_prompts', JSON.stringify(customPrompts));
                
                // Re-render slash prompts in main chat
                if (typeof initCustomPrompts === 'function') {
                    initCustomPrompts();
                }

                showToast('儲存成功', `系統已成功儲存為自訂快捷指令 「/${cmdTrigger}」！`, 'success');
            });
        }
    }

    // Dynamic Variables Parser helper
    function parseVariablesFromSystemInstruction() {
        const textarea = document.getElementById('cs-system-instruction');
        if (!textarea) return;
        
        const text = textarea.value;
        const regex = /\{\{(.*?)\}\}/g;
        const found = [];
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            const cleanName = match[1].trim();
            if (cleanName && !found.includes(cleanName)) {
                found.push(cleanName);
            }
        }

        // Keep any manually added variables that might not be in the text yet
        codespaceVariables.forEach(v => {
            if (!found.includes(v)) {
                found.push(v);
            }
        });

        codespaceVariables = found;
    }

    // Render Variables List Helper
    function renderCSVariables() {
        const list = document.getElementById('cs-variables-list');
        if (!list) return;

        list.innerHTML = '';
        if (codespaceVariables.length === 0) {
            list.innerHTML = '<span style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px;">目前尚未宣告變數。請在指令中使用 {{變數名}}</span>';
            return;
        }

        codespaceVariables.forEach((v, index) => {
            const row = document.createElement('div');
            row.className = 'cs-var-row';
            row.innerHTML = `
                <span class="cs-var-badge">{{${v}}}</span>
                <span style="font-size:12px; color:var(--text-secondary); flex:1;">自訂變數欄位</span>
                <button class="icon-btn" title="刪除此變數" onclick="window.deleteCSVariable('${v}', event)" style="color:var(--color-danger); opacity:0.7;">
                    <i data-lucide="trash-2" style="width:13px; height:13px;"></i>
                </button>
            `;
            list.appendChild(row);
        });
        lucide.createIcons();
    }

    // Global variable delete handler
    window.deleteCSVariable = function(name, event) {
        if (event) event.stopPropagation();
        codespaceVariables = codespaceVariables.filter(v => v !== name);
        
        // Remove from examples
        codespaceExamples.forEach(ex => {
            if (ex.inputs && ex.inputs[name] !== undefined) {
                delete ex.inputs[name];
            }
        });

        // Also clean up any occurrences in system prompt
        const textarea = document.getElementById('cs-system-instruction');
        if (textarea) {
            const regex = new RegExp(`\\\\{\\\\{\\\\s*${name}\\\\s*\\\\}\\\\}`, 'g');
            textarea.value = textarea.value.replace(regex, '');
        }

        renderCSVariables();
        renderCSExamples();
        renderCSTestGround();
        showToast('變數已刪除', `已從系統宣告中移除 {{${name}}}。`, 'info');
    };

    // Render Few-shot Examples Helper
    function renderCSExamples() {
        const container = document.getElementById('cs-examples-list');
        if (!container) return;

        container.innerHTML = '';
        if (codespaceExamples.length === 0) {
            container.innerHTML = '<span style="font-size:12px; color:var(--text-muted); text-align:center; padding:20px; display:block;">當前少樣本範例庫為空。請點擊上方「新增範例」按鈕引導 AI 學習！</span>';
            return;
        }

        codespaceExamples.forEach((ex, idx) => {
            const card = document.createElement('div');
            card.className = 'cs-example-card';
            
            // Build dynamic input inputs
            let inputsGridHTML = '';
            codespaceVariables.forEach(v => {
                const val = ex.inputs[v] !== undefined ? ex.inputs[v] : '';
                inputsGridHTML += `
                    <div class="cs-example-input-item">
                        <span class="cs-example-label" title="${v}">${v}</span>
                        <input type="text" class="cs-var-input cs-example-val-input" data-idx="${idx}" data-var="${v}" value="${val}" placeholder="輸入範例資料...">
                    </div>
                `;
            });

            card.innerHTML = `
                <div class="cs-example-header">
                    <span class="cs-example-title">📚 Few-shot 學習範例 #${idx + 1}</span>
                    <button class="icon-btn" title="刪除此範例" onclick="window.deleteCSExample(${idx}, event)" style="color:var(--color-danger); padding:2px;">
                        <i data-lucide="trash-2" style="width:13px; height:13px;"></i>
                    </button>
                </div>
                <div class="cs-example-inputs-grid">
                    ${inputsGridHTML || '<span style="font-size:11px; color:var(--text-muted);">無變數需要輸入</span>'}
                </div>
                <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
                    <span class="cs-example-label">期待輸出結果:</span>
                    <textarea class="cs-textarea cs-example-output-input" data-idx="${idx}" style="font-family:var(--font-mono); font-size:11px; height:70px;" placeholder="請填入此範例的期望輸出 Code / Text內容...">${ex.output || ''}</textarea>
                </div>
            `;
            container.appendChild(card);
        });

        // Bind examples data inputs listeners
        const valInputs = container.querySelectorAll('.cs-example-val-input');
        valInputs.forEach(input => {
            input.addEventListener('input', () => {
                const idx = parseInt(input.dataset.idx);
                const variable = input.dataset.var;
                if (codespaceExamples[idx]) {
                    if (!codespaceExamples[idx].inputs) codespaceExamples[idx].inputs = {};
                    codespaceExamples[idx].inputs[variable] = input.value;
                }
            });
        });

        const outputInputs = container.querySelectorAll('.cs-example-output-input');
        outputInputs.forEach(textarea => {
            textarea.addEventListener('input', () => {
                const idx = parseInt(textarea.dataset.idx);
                if (codespaceExamples[idx]) {
                    codespaceExamples[idx].output = textarea.value;
                }
            });
        });

        lucide.createIcons();
    }

    // Delete few-shot example
    window.deleteCSExample = function(idx, event) {
        if (event) event.stopPropagation();
        codespaceExamples.splice(idx, 1);
        renderCSExamples();
        showToast('已刪除範例', '該少樣本範例行已從工坊中移除。', 'info');
    };

    // Render Test Ground Helper
    function renderCSTestGround() {
        const container = document.getElementById('cs-test-fields');
        if (!container) return;

        container.innerHTML = '';
        if (codespaceVariables.length === 0) {
            container.innerHTML = '<span style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px; display:block;">目前沒有自訂變數。可以直接點擊「拼裝編譯」發起基本系統生成！</span>';
            return;
        }

        codespaceVariables.forEach(v => {
            const row = document.createElement('div');
            row.className = 'cs-test-field-row';
            row.innerHTML = `
                <span class="cs-test-label">填寫測試數據 : {{${v}}}</span>
                <input type="text" class="cs-var-input cs-test-val-input" data-var="${v}" style="height:32px; font-size:12.5px;" placeholder="請輸入 ${v} 的實時組裝測試資料...">
            `;
            container.appendChild(row);
        });
    }

    // Clean markdown visual wrapper code ticks
    function cleanMarkdownCodeBlocks(text) {
        let clean = text.trim();
        // Remove markdown starting blocks e.g. ```html
        clean = clean.replace(/^```[a-zA-Z]*\n/, '');
        // Remove markdown ending blocks e.g. ```
        clean = clean.replace(/\n```$/, '');
        return clean.trim();
    }

    // Run build / Compile implementation
    async function csRunBuild() {
        const sysInstructionTextarea = document.getElementById('cs-system-instruction');
        const runBtn = document.getElementById('cs-cs-run-btn') || document.getElementById('cs-run-btn');
        const stopBtn = document.getElementById('cs-stop-btn');
        const codeBlock = document.getElementById('cs-code-block');
        const iframe = document.getElementById('cs-preview-iframe');
        const emptyState = document.getElementById('cs-preview-empty');

        if (!sysInstructionTextarea || !runBtn) return;

        // Collect current test input variables
        const testInputs = {};
        const inputs = document.querySelectorAll('.cs-test-val-input');
        inputs.forEach(input => {
            testInputs[input.dataset.var] = input.value.trim();
        });

        // 1. Compile System Prompt System Instruction
        let systemPrompt = sysInstructionTextarea.value.trim();
        codespaceVariables.forEach(v => {
            const val = testInputs[v] || '';
            const replaceRegex = new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g');
            systemPrompt = systemPrompt.replace(replaceRegex, val);
        });

        // 2. Stitch Few-shot Examples
        let examplesPrompt = '';
        if (codespaceExamples.length > 0) {
            examplesPrompt = '以下是系統編譯對齊的 Few-shot 學習範例：\n\n';
            codespaceExamples.forEach((ex, idx) => {
                examplesPrompt += `【範例 #${idx + 1} 輸入】\n`;
                codespaceVariables.forEach(v => {
                    examplesPrompt += `${v}: ${ex.inputs[v] || ''}\n`;
                });
                examplesPrompt += `【期待範例 #${idx + 1} 輸出系統結果】\n${ex.output || ''}\n`;
                examplesPrompt += `--- [範例 #${idx + 1} 結束] ---\n\n`;
            });
        }

        // 3. Stitched Test Query
        let queryPrompt = '【最新實時組裝系統輸入】\n';
        codespaceVariables.forEach(v => {
            queryPrompt += `${v}: ${testInputs[v] || ''}\n`;
        });

        // Render prompt blueprint visualize labels
        document.getElementById('cs-bp-system').textContent = systemPrompt;
        document.getElementById('cs-bp-examples').textContent = examplesPrompt || '（未配置少樣本學習範例）';
        document.getElementById('cs-bp-query').textContent = queryPrompt;

        // Switch to Code View to see streaming output live
        const codeTabBtn = document.querySelector('.cs-tab-btn[data-cs-tab="code"]');
        if (codeTabBtn) codeTabBtn.click();

        // Start Streaming setup
        isGenerating = true;
        runBtn.disabled = true;
        if (stopBtn) stopBtn.style.display = 'flex';
        codeBlock.textContent = '系統編譯啟動中...';
        
        // Hide iframe and show empty during compile
        if (iframe) iframe.style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'flex';
            const h5 = emptyState.querySelector('h5');
            const p = emptyState.querySelector('p');
            if (h5) h5.textContent = '系統正在實時編譯中...';
            if (p) p.textContent = '編譯完畢後，小工具將在此安全沙盒中自動加載渲染運作。';
        }

        abortController = new AbortController();

        // Build Payload
        const messages = [
            {
                role: 'system',
                content: systemPrompt + (examplesPrompt ? '\n\n' + examplesPrompt : '')
            },
            {
                role: 'user',
                content: queryPrompt
            }
        ];

        const payload = {
            model: config.model,
            messages: messages,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            stream: true
        };

        const endpointUrl = window.location.protocol === 'file:' ? 'http://localhost:3000/api/chat' : '/api/chat';
        const requestHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        };

        try {
            const response = await fetch(endpointUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(payload),
                signal: abortController.signal
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP 錯誤 ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let completeText = '';
            codeBlock.textContent = ''; // clear loading state

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep last incomplete line

                for (let line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine) continue;
                    if (cleanLine === 'data: [DONE]') continue;

                    if (cleanLine.startsWith('data: ')) {
                        try {
                            const parsed = JSON.parse(cleanLine.substring(6));
                            const delta = parsed.choices?.[0]?.delta?.content || '';
                            if (delta) {
                                completeText += delta;
                                codeBlock.textContent = completeText;
                                
                                // Auto scroll code display view
                                const codeContainer = document.getElementById('cs-tab-code');
                                if (codeContainer) {
                                    codeContainer.scrollTop = codeContainer.scrollHeight;
                                }
                            }
                        } catch (e) {
                            // ignore malformed SSE json
                        }
                    }
                }
            }

            // Generation Finished successfully!
            isGenerating = false;
            runBtn.disabled = false;
            if (stopBtn) stopBtn.style.display = 'none';

            // Clean code blocks
            const extracted = cleanMarkdownCodeBlocks(completeText);

            // Automatically render inside Live Sandbox tab!
            const previewTabBtn = document.querySelector('.cs-tab-btn[data-cs-tab="preview"]');
            if (previewTabBtn) previewTabBtn.click();

            if (iframe && emptyState) {
                iframe.style.display = 'block';
                emptyState.style.display = 'none';

                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                doc.write(extracted);
                doc.close();
            }

            showToast('編譯完成', '系統拼裝成果已成功載入 Live Sandbox！', 'success');

        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('[Code Space Build Error]', err);
            codeBlock.textContent = `❌ 編譯進程失敗：\n${err.message}`;
            isGenerating = false;
            runBtn.disabled = false;
            if (stopBtn) stopBtn.style.display = 'none';
            showToast('編譯失敗', err.message, 'error');
        }
    }

    // Start App!
    init();
    initArtifactsResize();
    initArtifactsTabs();
});
