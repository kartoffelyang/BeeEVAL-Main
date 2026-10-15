const architecture = {
  // 侧边栏 & 标题
  'architecture': '架构拓扑',
  'arch_title': '项目架构 / 功能拓扑',
  'arch_subtitle': '智能座舱 AI 评测平台 · 四类 Agent 工作流 + 全链路数据流',

  // Tab
  'arch_tab_overview': '全景拓扑',
  'arch_tab_agents': 'Agent 构成',
  'arch_tab_infra': '部署与依赖',

  // 全景层
  'arch_layer_producer': '数据生产',
  'arch_layer_core': '数据核心',
  'arch_layer_consumer': '数据消费',
  'arch_flow_hint': '点击任意 Agent 卡片查看其工作流、模型与上下游详情',

  // 通用字段标签
  'arch_field_trigger': '触发方式',
  'arch_field_model': '主模型',
  'arch_field_role': '角色',
  'arch_field_upstream': '上游输入',
  'arch_field_downstream': '下游写入',
  'arch_field_deps': '关键依赖',
  'arch_field_workflow': '工作流',
  'arch_field_submodules': '子模块',
  'arch_field_entry': '入口',
  'arch_close': '收起',

  // 角色徽章
  'arch_badge_producer': '生产者',
  'arch_badge_consumer': '消费者',
  'arch_badge_helper': '辅助',
  'arch_badge_primary': '主力',
  'arch_badge_legacy': '旧链路',

  // 数据核心节点
  'arch_core_pg': 'PostgreSQL',
  'arch_core_pg_desc': 'video_results · evaluation_scores · vehicle_aggregated_scores',
  'arch_core_qdrant': 'Qdrant 向量库',
  'arch_core_qdrant_desc': 'collection: beeeval / beeeval_mimo · 768d cosine',

  // 部署层
  'arch_infra_edge': '接入层',
  'arch_infra_app': '应用层',
  'arch_infra_data': '数据层',
  'arch_infra_external': '外部 / 挂载依赖',
  'arch_infra_note': '生产环境下 postgres / redis / qdrant 仅绑定 127.0.0.1,统一接入 beeeval-net;嵌入 / Whisper / reranker 模型不打进镜像,经 bind mount 复用宿主机文件。',

  // 文档指引
  'arch_doc_link': '完整文档:docs/项目架构-功能拓扑图.md',
};

export default architecture;
