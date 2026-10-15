const architecture = {
  // sidebar & header
  'architecture': 'Architecture',
  'arch_title': 'Architecture / Capability Topology',
  'arch_subtitle': 'Intelligent cockpit AI evaluation platform · 4 agent workflows + end-to-end data flow',

  // tabs
  'arch_tab_overview': 'Topology',
  'arch_tab_agents': 'Agents',
  'arch_tab_infra': 'Deploy & Deps',

  // overview layers
  'arch_layer_producer': 'Producers',
  'arch_layer_core': 'Data Core',
  'arch_layer_consumer': 'Consumers',
  'arch_flow_hint': 'Click any agent card to see its workflow, model and up/downstream details',

  // common field labels
  'arch_field_trigger': 'Trigger',
  'arch_field_model': 'Main model',
  'arch_field_role': 'Role',
  'arch_field_upstream': 'Upstream',
  'arch_field_downstream': 'Downstream',
  'arch_field_deps': 'Key deps',
  'arch_field_workflow': 'Workflow',
  'arch_field_submodules': 'Sub-modules',
  'arch_field_entry': 'Entry',
  'arch_close': 'Close',

  // role badges
  'arch_badge_producer': 'Producer',
  'arch_badge_consumer': 'Consumer',
  'arch_badge_helper': 'Helper',
  'arch_badge_primary': 'Primary',
  'arch_badge_legacy': 'Legacy',

  // data core nodes
  'arch_core_pg': 'PostgreSQL',
  'arch_core_pg_desc': 'video_results · evaluation_scores · vehicle_aggregated_scores',
  'arch_core_qdrant': 'Qdrant Vector Store',
  'arch_core_qdrant_desc': 'collection: beeeval / beeeval_mimo · 768d cosine',

  // infra layers
  'arch_infra_edge': 'Edge',
  'arch_infra_app': 'Application',
  'arch_infra_data': 'Data',
  'arch_infra_external': 'External / Mounted',
  'arch_infra_note': 'In production, postgres / redis / qdrant bind to 127.0.0.1 only and join beeeval-net; embedding / Whisper / reranker models are bind-mounted from the host, not baked into images.',

  // doc pointer
  'arch_doc_link': 'Full doc: docs/项目架构-功能拓扑图.md',
};

export default architecture;
