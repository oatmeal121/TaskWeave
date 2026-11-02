export type GuideLanguage = "zh" | "en";
export type GuideDestination = "kanban" | "gantt" | "projects" | "recurring" | "reminders" | "tags" | "trash" | "settings";
export type GuideGroupId = "start" | "tasks" | "planning" | "maintenance";

type GuideContent = {
  body?: string[];
  steps?: Array<{ action: string; result?: string }>;
  table?: { headers: string[]; rows: string[][] };
  note?: string;
};

export type GuideSection = GuideContent & {
  id: string;
  title: string;
  details?: GuideContent & { title: string };
  image?: GuideImage;
};

export type GuideImage = {
  src: string;
  alt: string;
  caption: string;
  legend: Array<{ label: string; text: string }>;
};

export type GuideArticle = {
  id: string;
  group: GuideGroupId;
  title: string;
  summary: string;
  entry: string;
  destination?: GuideDestination;
  action?: string;
  keywords: string;
  image?: GuideImage;
  sections: GuideSection[];
  related: string[];
};

type UserGuide = {
  title: string;
  introduction: string;
  overview: string;
  contents: string;
  toggleContents: string;
  search: string;
  searchPlaceholder: string;
  clear: string;
  results: string;
  noResults: string;
  startTitle: string;
  startDescription: string;
  referenceTitle: string;
  faqTitle: string;
  entryLabel: string;
  onThisPage: string;
  expected: string;
  note: string;
  related: string;
  next: string;
  zoom: string;
  closeImage: string;
  imageHint: string;
  modeLabel: string;
  modeNote: string;
  screenshotNote: string;
  desktopLabel: string;
  browserLabel: string;
  groups: Array<{ id: GuideGroupId; title: string; description: string }>;
  articles: GuideArticle[];
  questions: Array<{ question: string; articleId: string; sectionId: string }>;
};

export const userGuides: Record<GuideLanguage, UserGuide> = {
  zh: {
    title: "使用指南",
    introduction: "从记下一件要做的事开始。",
    overview: "首页",
    contents: "目录",
    toggleContents: "展开或收起目录",
    search: "搜索指南",
    searchPlaceholder: "搜索：颜色、补记、提醒……",
    clear: "清空",
    results: "项结果",
    noResults: "没有找到，换个关键词试试。",
    startTitle: "基本操作",
    startDescription: "先完成一个任务，再按需要整理和记录。",
    referenceTitle: "其他操作",
    faqTitle: "常见问题",
    entryLabel: "入口",
    onThisPage: "本页",
    expected: "结果",
    note: "注意",
    related: "相关操作",
    next: "下一步",
    zoom: "放大截图",
    closeImage: "关闭图片",
    imageHint: "点击放大",
    modeLabel: "数据保存在本机",
    modeNote: "网页版与桌面版的数据分别保存；迁移请用设置中的导出、导入。",
    screenshotNote: "",
    desktopLabel: "桌面版",
    browserLabel: "网页版",
    groups: [
      { id: "start", title: "日常使用", description: "" },
      { id: "planning", title: "日程安排", description: "" },
      { id: "maintenance", title: "数据与软件", description: "" },
    ],
    articles: [
      {
        id: "quick-start", group: "start", title: "新建和完成任务",
        summary: "记下要做的事，开始做时拖到进行中，做完再拖到完成。",
        entry: "左侧菜单 → 看板", destination: "kanban", action: "打开看板",
        keywords: "入门 新建 创建 保存 重要 紧急 蓝色 红色 颜色 深浅 拖动 待办 进行中 完成 编辑",
        sections: [
          {
            id: "create", title: "新建任务",
            steps: [
              { action: "打开看板，点击上方“新建”，填写任务名称，例如“准备周五的汇报”。" },
              { action: "可以按需要开启“重要”“紧急”，再点击“保存”。其余选项暂时不填也可以。" },
            ],
            body: ["任务默认出现在待办区。卡片左侧的蓝色表示重要，右侧的红色表示紧急：开启时颜色较深，关闭时较浅。两项可以分别设置。"],
          },
          {
            id: "workflow", title: "更新任务状态",
            body: ["开始做这件事时，按住卡片左侧的点状手柄，拖到“进行中”区。做完后，再拖到“完成”区；状态会自动保存。"],
            image: { src: "help/workspace-zh.png", alt: "看板中的待办、进行中和完成区", caption: "从卡片左侧的点状手柄拖动，改变任务状态。", legend: [] },
          },
          {
            id: "edit", title: "编辑任务",
            body: ["点击卡片上的铅笔图标，修改名称或重要、紧急设置，再点击“更新”。"],
          },
        ],
        image: { src: "help/create-task-zh.png", alt: "新建任务中的名称、重要和紧急开关", caption: "填写名称后即可保存，其他选项按需设置。", legend: [] },
        related: ["task-details"],
      },
      {
        id: "projects", group: "start", title: "按项目整理任务",
        summary: "把同一件工作下的任务放在一起，例如一次汇报或一门课程。",
        entry: "左侧菜单 → 项目", destination: "projects", action: "打开项目",
        keywords: "项目 子项目 父项目 层级 折叠 名称 删除 未归档 标签 分类 排序",
        sections: [
          {
            id: "create", title: "创建项目并分配任务",
            steps: [
              { action: "打开“项目”，填写项目名称，例如“周五汇报”，点击“添加”。" },
              { action: "回到看板，点击任务的铅笔图标，在“项目”中选中它，再点击“更新”。新建任务时也可以直接选项目。" },
            ],
            body: ["看板会按项目分组。点击分组标题可以收起任务，拖动标题可以调整分组顺序。"],
          },
          {
            id: "children", title: "添加子项目",
            body: ["添加项目时选择一个“父项目”，就能建立子项目，例如在“周五汇报”下分出“资料整理”和“演示准备”。项目前的箭头可以收起或展开下级项目。"],
            details: {
              title: "筛选、改名与删除",
              body: [
                "按父项目筛选任务时，会包含所有下级项目。点击项目名称可改名或更换父项目，再点保存图标。",
                "删除项目时，可将其任务变为未归档或送入回收站；下级项目会提升一级并保留。",
              ],
            },
          },
          {
            id: "tags", title: "添加标签",
            body: ["例如把不同项目里需要沟通的任务都标为“待沟通”，可以在任务的“更多设置 → 标签”中填写。多个标签用逗号分隔。"],
            details: { title: "管理标签", body: ["在“标签”页可统一改名或删除标签。删除标签会保留任务。"] },
          },
        ],
        image: { src: "help/projects-zh.png", alt: "项目及其下级项目", caption: "选择父项目，建立下一级分类。", legend: [] },
        related: [],
      },
      {
        id: "gantt", group: "start", title: "记录和回顾工作",
        summary: "任务还没完成，也可以记录今天做过，之后在甘特图里回看。",
        entry: "看板 → 今天做了；左侧菜单 → 甘特图", destination: "gantt", action: "打开甘特图",
        keywords: "今天做了 做了 甘特图 回顾 补记 打卡 小黄点 圆点 活动记录 日期 时间线 周分隔",
        sections: [
          {
            id: "today", title: "记录当天的工作",
            body: ["在看板上点击任务的勾选按钮（悬停显示“今天做了”），就记下了当天做过这件事；再点一次可以取消。它不会改变任务状态，一件任务可以连续记录多天。"],
          },
          {
            id: "range", title: "查看工作记录",
            body: ["打开“甘特图”，调整上方的“展示日期”。每一行是一项任务，黄色记录点表示哪天做过，深色竖线隔开不同周。这样就能把安排和实际做过的日期放在一起看。"],
            image: { src: "help/gantt-zh.png", alt: "任务时间条和不同日期的活动记录点", caption: "黄色记录点标出当天做过的任务。", legend: [] },
            details: {
              title: "时间条说明",
              body: ["未完成任务的时间条从开始日期延伸至截止日期；没有截止日期则继续延伸。完成后，以完成日期为终点。点击任务可以查看说明或编辑。"],
            },
          },
          {
            id: "activity", title: "补记工作记录",
            body: ["在甘特图中找到任务对应的日期格，点击记录点即可补记，再点一次取消。可以修改今天及过去的记录；今天的记录会同步到看板。"],
          },
        ],
        related: ["task-details"],
      },
      {
        id: "task-details", group: "planning", title: "补充任务信息",
        summary: "需要说明怎么做、哪天开始或何时截止，再补充这些信息。",
        entry: "任务卡片 → 铅笔", destination: "kanban", action: "打开看板",
        keywords: "描述 更多设置 日期 开始 截止 时分 完成时间 Tab 制表符 缩进 搜索 筛选 历史完成 找不到任务 不见了 隐藏",
        sections: [
          {
            id: "edit", title: "填写任务描述",
            body: ["编辑任务，展开“更多设置”，在“描述”里写下步骤或备注，点击“更新”。以后点击卡片右侧的箭头，就能查看说明。"],
            details: { title: "在描述中缩进", body: ["Tab 会插入制表符；Shift+Tab 将焦点移到上一个控件。"] },
          },
          {
            id: "dates", title: "设置开始和截止时间",
            body: ["在“截止”中填写期限；若计划以后再做，在“更多设置”里修改开始日期，也可以填写具体时分。尚未到开始时间的任务先放在甘特图中，到时才出现在看板。"],
            details: {
              title: "日期、完成时间与提醒",
              body: [
                "开始日期默认今天，截止日期和时分都可留空。未填写时分时按全天处理；未完成任务超过截止时间会标记超时。",
                "拖到完成区时，完成日期默认为今天。要补记实际完成日期，在“更多设置”里将状态选为“完成”，修改完成日期后点击“更新”。",
                "日期不会自动产生提醒。需要到时提示，可在编辑已有任务时点击“设置提醒”。",
              ],
            },
          },
          {
            id: "visibility", title: "查找任务",
            body: ["以前完成的任务，在完成区打开“历史完成”，调整日期范围。尚未到开始时间的任务，在甘特图查看。若仍找不到，清除搜索和筛选，展开项目分组；已删除的任务到回收站查看。"],
            note: "“最近30天”只是显示范围，不会删除更早的完成记录。",
          },
        ],
        related: ["reminders", "backup"],
      },
      {
        id: "recurring", group: "planning", title: "设置重复任务",
        summary: "例如每周写周报，设置一次后就不用每次重新建任务。",
        entry: "左侧菜单 → 重复任务", destination: "recurring", action: "打开重复任务",
        keywords: "重复 循环 模板 描述 继承 每天 每周 每月 自动",
        sections: [
          {
            id: "create", title: "创建重复任务模板",
            steps: [
              { action: "打开“重复任务”，填写名称，选择每天、每周或每月。" },
              { action: "每周或每月的任务，先点开始日，再点截止日；同一天需要点两次。点击“创建模板”。" },
            ],
            body: ["需要每次都带上的说明，可以写在模板的“描述”中。之后生成的任务和普通任务一样，拖动即可改变状态。"],
            details: { title: "任务生成时间", body: ["系统准备当前和下一周期的任务。尚未开始的任务可在甘特图查看。模板中的时分也会带入任务；每月不存在的日期按月末处理。"] },
          },
          {
            id: "changes", title: "修改模板",
            body: ["点击模板名称即可编辑，保存后会重新安排相关未完成任务，已完成记录保留。"],
            details: { title: "删除模板", body: ["删除模板会清理今天及以后开始的未完成任务；已完成或更早开始的任务保留。"] },
          },
        ],
        related: ["gantt"],
      },
      {
        id: "reminders", group: "planning", title: "设置提醒",
        summary: "为任务设提醒，或单独提醒开会、起身走动。",
        entry: "左侧菜单 → 提醒", destination: "reminders", action: "打开提醒",
        keywords: "提醒 会议 起身 走动 每小时 每天 每周 每月 稍后 分钟 小时 天 知道了 关闭 托盘 不堆积",
        sections: [
          {
            id: "create", title: "新建提醒",
            steps: [
              { action: "打开“提醒”，选择关联已有任务，或创建独立提醒。" },
              { action: "填写标题、提醒日期和时间，点击“保存并启用提醒”。独立提醒不会新建任务。" },
            ],
            details: { title: "提醒与任务的关系", body: ["提醒时间独立于任务的开始、截止时间。任务完成或删除后，关联提醒停止；删除提醒会保留任务。"] },
          },
          {
            id: "delivery", title: "设置重复提醒",
            body: ["在重复频率中选择“每小时”等规则。例如从 14:30 开始的每小时提醒，之后会在 15:30、16:30 提示。同一提醒只保留一条待处理提示，离开一整晚也不会堆积。"],
            note: "桌面版需保持打开或留在托盘，网页版需保持页面打开。彻底退出、关机或休眠时无法提醒，恢复后补发一次。",
          },
          {
            id: "handle", title: "确认或延后提醒",
            body: ["提醒会在屏幕中央弹出，没有提示音。点击“知道了”确认；暂时不方便时，点击“5 分钟后再提醒”，旁边的箭头可以改成其他分钟数、小时或天。"],
            details: {
              title: "关闭、延后或查看任务",
              body: [
                "“知道了”不会把任务标记完成。“查看任务”会打开任务详情，并确认这条提醒。",
                "关闭提醒窗口或点击“全部知道了”，会确认当前显示的所有提醒，已经延后的提醒不受影响。",
                "延后不会改变重复规则，也不会被下一周期打断。未处理和已延后的提醒在重启后保留。",
              ],
            },
          },
        ],
        image: { src: "help/reminders-zh.png", alt: "独立提醒的时间与重复频率设置", caption: "独立提醒可以用于会议或定时休息。", legend: [] },
        related: ["desktop"],
      },
      {
        id: "backup", group: "maintenance", title: "备份和迁移数据",
        summary: "用数据文件备份，也可以把网页里的记录转到软件中。",
        entry: "设置 → 数据迁移与备份", destination: "settings", action: "打开设置",
        keywords: "备份 导入 导出 迁移 换电脑 网页 桌面 数据丢失 恢复 回收站 删除 保留期",
        sections: [
          {
            id: "export", title: "导出备份",
            body: ["在设置中点击“导出数据文件”，保管好下载的 JSON 文件。"],
            details: { title: "备份内容", body: ["包含任务、项目、标签、重复任务和提醒规则，不含界面偏好与待处理提醒。"] },
          },
          {
            id: "transfer", title: "迁移数据",
            body: ["先在原来有记录的软件或浏览器中导出，再到目标软件的设置中点击“导入数据文件”，选择这份文件。"],
            note: "网页版与桌面版不共用数据。导入只补入缺少的记录，已有相同记录保持当前内容。",
          },
          {
            id: "trash", title: "恢复已删除的任务",
            body: ["到“回收站”点击“恢复”。回收站默认保留 30 天，可在设置中修改；彻底删除或到期清理后，需要之前的备份才能找回。"],
          },
        ],
        related: ["desktop"],
      },
      {
        id: "desktop", group: "maintenance", title: "托盘、启动与更新",
        summary: "让提醒留在托盘运行，也可以随 Windows 自动启动。",
        entry: "系统托盘、设置", destination: "settings", action: "打开设置",
        keywords: "安装 卸载 更新 升级 版本 置顶 关闭 托盘 单击 退出 开机 自启动 中英 黑夜 外观",
        sections: [
          {
            id: "tray", title: "关闭和恢复窗口",
            body: ["桌面版点击关闭会收进系统托盘，提醒继续运行。单击托盘图标即可恢复窗口；彻底退出请右键图标，选择“退出 TaskWeave”。"],
          },
          {
            id: "preferences", title: "开机自启动",
            body: ["在设置中打开“开机自动启动”，登录 Windows 后就会进入托盘。"],
            details: { title: "语言、外观与置顶", body: ["设置中可切换中英文、白天／黑夜／跟随系统。标题栏的图钉可切换始终置顶。"] },
          },
          {
            id: "install", title: "更新软件",
            body: ["先从托盘退出旧版，再运行新版安装包。若出现“Delete the application data（删除应用数据）”，保持不勾选，以保留记录。"],
            details: { title: "自动检查更新", body: ["已配置更新的发布版会自动检查新版，由您点击“下载并安装”。显示发布地址未配置时，使用安装包更新。"] },
          },
        ],
        related: ["backup"],
      },
    ],
    questions: [
      { question: "任务为什么不在看板上？", articleId: "task-details", sectionId: "visibility" },
      { question: "怎么补记昨天做过？", articleId: "gantt", sectionId: "activity" },
      { question: "网页里的记录怎么转到软件？", articleId: "backup", sectionId: "transfer" },
      { question: "每小时提醒会堆积吗？", articleId: "reminders", sectionId: "delivery" },
      { question: "关闭窗口后怎么再打开？", articleId: "desktop", sectionId: "tray" },
    ],
  },
  en: {
    title: "User guide",
    introduction: "Start with something you need to do.",
    overview: "Home",
    contents: "Contents",
    toggleContents: "Show or hide contents",
    search: "Search the guide",
    searchPlaceholder: "Search colors, activity, reminders…",
    clear: "Clear",
    results: "results",
    noResults: "No matches. Try another keyword.",
    startTitle: "Basic operations",
    startDescription: "Start with one task, then organize and record work as needed.",
    referenceTitle: "Other operations",
    faqTitle: "Common questions",
    entryLabel: "Where",
    onThisPage: "On this page",
    expected: "Result",
    note: "Note",
    related: "Related actions",
    next: "Next",
    zoom: "Enlarge screenshot",
    closeImage: "Close image",
    imageHint: "Click to enlarge",
    modeLabel: "Data stays on this computer",
    modeNote: "Browser and desktop records are stored separately. Use Export and Import in Settings to transfer them.",
    screenshotNote: "",
    desktopLabel: "Desktop",
    browserLabel: "Browser",
    groups: [
      { id: "start", title: "Everyday use", description: "" },
      { id: "planning", title: "Scheduling", description: "" },
      { id: "maintenance", title: "Data and app", description: "" },
    ],
    articles: [
      {
        id: "quick-start", group: "start", title: "Create and complete tasks",
        summary: "Write it down, move it to Doing when you start, and to Done when you finish.",
        entry: "Left sidebar → Kanban", destination: "kanban", action: "Open Kanban",
        keywords: "start new create save important urgent blue red color drag todo doing done edit",
        sections: [
          {
            id: "create", title: "Create a task",
            steps: [
              { action: "Open Kanban, click New at the top, and enter a name such as Prepare Friday's presentation." },
              { action: "Turn on Important or Urgent if needed, then click Save. You can leave the other options as they are." },
            ],
            body: ["The task starts in Todo. The card's blue left side indicates importance; its red right side indicates urgency. Each color is stronger when its switch is on and lighter when off. The two switches are independent."],
          },
          {
            id: "workflow", title: "Update task status",
            body: ["When you start, use the dotted handle on the left of the card to drag it to Doing. Once finished, drag it to Done. The status saves automatically."],
            image: { src: "help/workspace-en.png", alt: "Todo, Doing, and Done columns in Kanban", caption: "Drag from the dotted handle on the left to change task status.", legend: [] },
          },
          {
            id: "edit", title: "Edit a task",
            body: ["Click the pencil on the card, change its name or priority switches, then click Update."],
          },
        ],
        image: { src: "help/create-task-en.png", alt: "New task name and Important and Urgent switches", caption: "A name is enough to save. Set other options when needed.", legend: [] },
        related: ["task-details"],
      },
      {
        id: "projects", group: "start", title: "Organize tasks into projects",
        summary: "Keep tasks for the same piece of work together, such as a presentation or a course.",
        entry: "Left sidebar → Projects", destination: "projects", action: "Open Projects",
        keywords: "project subproject parent hierarchy collapse rename delete unfiled tag category order",
        sections: [
          {
            id: "create", title: "Create a project and assign tasks",
            steps: [
              { action: "Open Projects, enter a project name such as Friday's presentation, then click Add." },
              { action: "Return to Kanban, click a task's pencil, select the project, then Update. You can also choose a project when creating a task." },
            ],
            body: ["Kanban groups tasks by project. Click a group heading to fold it, or drag the heading to change the group order."],
          },
          {
            id: "children", title: "Add a subproject",
            body: ["Choose a Parent project when adding a project to make it a subproject. For example, split Friday's presentation into Research and Slides. The arrow beside a project folds or expands its children."],
            details: {
              title: "Filter, rename, or delete",
              body: [
                "Filtering by a parent includes all its descendants. Click a project name to rename it or change its parent, then click the save icon.",
                "When deleting a project, choose whether its tasks become unfiled or move to Trash. Child projects move up one level and remain available.",
              ],
            },
          },
          {
            id: "tags", title: "Add tags",
            body: ["To mark tasks across projects, such as items Waiting for feedback, enter a tag under More settings → Tags in the task editor. Separate multiple tags with commas."],
            details: { title: "Manage tags", body: ["Rename or delete tags in Tags. Deleting a tag keeps its tasks."] },
          },
        ],
        image: { src: "help/projects-en.png", alt: "Projects and their child projects", caption: "Choose a parent to create a subproject.", legend: [] },
        related: [],
      },
      {
        id: "gantt", group: "start", title: "Record and review work",
        summary: "Record work even before a task is finished, then review it in Gantt.",
        entry: "Kanban → Today; left sidebar → Gantt", destination: "gantt", action: "Open Gantt",
        keywords: "today worked activity gantt review record past date yellow dot timeline week divider",
        sections: [
          {
            id: "today", title: "Record today's work",
            body: ["Click the checkmark on a task in Kanban (hover to see Today) to record work for today; click again to undo. This keeps its status unchanged. You can record work on the same task across several days."],
          },
          {
            id: "range", title: "Review work records",
            body: ["Open Gantt and adjust Display dates at the top. Each row is a task; yellow dots mark the days you worked on it, and dark vertical lines separate weeks. This puts your schedule and work record in one view."],
            image: { src: "help/gantt-en.png", alt: "Task bars and activity dots on different dates", caption: "Yellow dots mark the days you worked on each task.", legend: [] },
            details: {
              title: "What the bars mean",
              body: ["An unfinished task runs from its start to its deadline, or continues if no deadline is set. Completed bars end on the completion date. Click a task to view its details or edit it."],
            },
          },
          {
            id: "activity", title: "Add past activity",
            body: ["Find the task row and date in Gantt, then click the activity dot to add a record. Click again to remove it. You can edit today and past dates; today's record stays in sync with Kanban."],
          },
        ],
        related: ["task-details"],
      },
      {
        id: "task-details", group: "planning", title: "Add task details",
        summary: "Add instructions, a start date, or a deadline when the task needs them.",
        entry: "Task card → pencil", destination: "kanban", action: "Open Kanban",
        keywords: "description more settings dates start due time completion Tab indentation search filter history missing hidden",
        sections: [
          {
            id: "edit", title: "Write a task description",
            body: ["Edit the task, open More settings, write steps or notes in Description, then click Update. Later, click the arrow on the right of the card to read them."],
            details: { title: "Indent a description", body: ["Tab inserts a tab character. Shift+Tab moves focus to the previous control."] },
          },
          {
            id: "dates", title: "Set start and due dates",
            body: ["Fill in Due for a deadline. To plan work for later, change its start date under More settings; you can also set times. Future tasks appear in Gantt first and join Kanban when their start date or time arrives."],
            details: {
              title: "Dates, completion, and reminders",
              body: [
                "Start defaults to today. Due date and times are optional. A date without a time covers the full day; unfinished tasks past their deadline are marked overdue.",
                "Dragging to Done records today as the completion date. To use an earlier date, open More settings, set status to Done, change Completion date, then Update.",
                "Dates do not create reminders. Click Set reminder while editing an existing task to add one.",
              ],
            },
          },
          {
            id: "visibility", title: "Find a task",
            body: ["For earlier completions, open Done history in the Done column and adjust the date range. Look in Gantt for tasks that have not started yet. If a task is still missing, clear search and filters, and expand its project group. Check Trash for deleted tasks."],
            note: "Last 30 days only limits what is shown. It does not delete older completed tasks.",
          },
        ],
        related: ["reminders", "backup"],
      },
      {
        id: "recurring", group: "planning", title: "Set up recurring tasks",
        summary: "Set up work such as a weekly report once, instead of creating it each time.",
        entry: "Left sidebar → Recurring", destination: "recurring", action: "Open Recurring",
        keywords: "recurring repeat template description inherited daily weekly monthly automatic",
        sections: [
          {
            id: "create", title: "Create a recurring task template",
            steps: [
              { action: "Open Recurring, enter a name, and choose daily, weekly, or monthly." },
              { action: "For weekly or monthly tasks, select start first, then due. Click twice to use the same day. Click Create template." },
            ],
            body: ["Put instructions needed every time in the template's Description. Generated tasks work like other tasks: drag them to change their status."],
            details: { title: "When tasks appear", body: ["Tasks are prepared for the current and next cycle. Future tasks appear in Gantt. Generated tasks also use the template's times; dates missing from a month use its last day."] },
          },
          {
            id: "changes", title: "Edit a template",
            body: ["Click the template name to edit it. Saving reschedules related unfinished tasks; completed records remain."],
            details: { title: "Delete a template", body: ["Deleting the template removes unfinished tasks starting today or later. Completed tasks and tasks with earlier start dates remain."] },
          },
        ],
        related: ["gantt"],
      },
      {
        id: "reminders", group: "planning", title: "Set reminders",
        summary: "Set a task reminder, or a separate reminder for a meeting or a break.",
        entry: "Left sidebar → Reminders", destination: "reminders", action: "Open Reminders",
        keywords: "reminder meeting break hourly daily weekly monthly snooze minutes hours days dismiss close tray duplicates",
        sections: [
          {
            id: "create", title: "Create a reminder",
            steps: [
              { action: "Open Reminders and link an existing task, or choose a standalone reminder." },
              { action: "Enter a title, date, and time, then click Save and enable reminder. A standalone reminder does not create a task." },
            ],
            details: { title: "How reminders relate to tasks", body: ["The reminder time is independent of task dates. Completing or deleting a task stops its reminders; deleting a reminder keeps the task."] },
          },
          {
            id: "delivery", title: "Set up repeating reminders",
            body: ["Choose Hourly or another repeat frequency. An hourly reminder starting at 14:30 will also remind you at 15:30 and 16:30. Each reminder keeps one pending alert, so being away overnight will not create a pile of alerts."],
            note: "Keep the desktop app open or in the tray, or keep the browser page open. Reminders cannot appear after full exit, shutdown, or during sleep; they catch up once on resume.",
          },
          {
            id: "handle", title: "Dismiss or snooze a reminder",
            body: ["A silent window appears in the center of the screen. Click Got it to acknowledge it, or Snooze 5 minutes if you need more time. The arrow beside Snooze lets you choose other minutes, hours, or days."],
            details: {
              title: "Close, snooze, or view the task",
              body: [
                "Got it keeps the task's status unchanged. View task opens its details and acknowledges the alert.",
                "Closing the reminder window or choosing Dismiss all acknowledges all currently shown alerts. Already snoozed alerts remain scheduled.",
                "Snoozing keeps the repeat rule and is not interrupted by the next cycle. Pending and snoozed alerts survive a restart.",
              ],
            },
          },
        ],
        image: { src: "help/reminders-en.png", alt: "Standalone reminder time and repeat settings", caption: "Use standalone reminders for meetings or regular breaks.", legend: [] },
        related: ["desktop"],
      },
      {
        id: "backup", group: "maintenance", title: "Back up and transfer data",
        summary: "Back up to a data file, or move browser records to the desktop app.",
        entry: "Settings → Data transfer and backup", destination: "settings", action: "Open Settings",
        keywords: "backup import export transfer new computer browser desktop lost data recover trash delete retention",
        sections: [
          {
            id: "export", title: "Export a backup",
            body: ["In Settings, click Export data file and keep the downloaded JSON file."],
            details: { title: "What the file includes", body: ["It includes tasks, projects, tags, templates, and reminder rules, but not interface preferences or pending alerts."] },
          },
          {
            id: "transfer", title: "Transfer data",
            body: ["Export from the app or browser containing your records. In the destination app's Settings, click Import data file and select that file."],
            note: "Browser and desktop stores are separate. Import adds missing records and keeps the current content of existing records.",
          },
          {
            id: "trash", title: "Restore deleted tasks",
            body: ["Open Trash and click Restore. Trash keeps tasks for 30 days by default; change this in Settings. After permanent deletion or automatic cleanup, recovery requires an earlier backup."],
          },
        ],
        related: ["desktop"],
      },
      {
        id: "desktop", group: "maintenance", title: "Tray, startup, and updates",
        summary: "Leave reminders running in the tray, or start the app with Windows.",
        entry: "System tray, Settings", destination: "settings", action: "Open Settings",
        keywords: "install uninstall update upgrade version pin close tray click exit launch startup language theme dark light",
        sections: [
          {
            id: "tray", title: "Close and reopen the window",
            body: ["Closing the desktop window hides it in the tray while reminders keep running. Click the tray icon once to restore it. To quit fully, right-click it and choose Exit TaskWeave."],
          },
          {
            id: "preferences", title: "Launch at startup",
            body: ["Enable Launch at startup in Settings. The app will start in the tray when you sign in to Windows."],
            details: { title: "Language, appearance, and pinning", body: ["Settings offers 中文 / English and Light / Dark / System. The title-bar pin toggles Always on top."] },
          },
          {
            id: "install", title: "Update the app",
            body: ["Exit the old app from the tray, then run the new installer. If offered Delete the application data, leave it unchecked to keep your records."],
            details: { title: "Automatic update checks", body: ["Releases with updates configured check automatically and wait for you to click Download and install. If the release address is not configured, update using an installer."] },
          },
        ],
        related: ["backup"],
      },
    ],
    questions: [
      { question: "Why is a task missing from Kanban?", articleId: "task-details", sectionId: "visibility" },
      { question: "How do I record work from yesterday?", articleId: "gantt", sectionId: "activity" },
      { question: "How do I move browser records to desktop?", articleId: "backup", sectionId: "transfer" },
      { question: "Will hourly reminders pile up?", articleId: "reminders", sectionId: "delivery" },
      { question: "How do I reopen a closed window?", articleId: "desktop", sectionId: "tray" },
    ],
  },
};
