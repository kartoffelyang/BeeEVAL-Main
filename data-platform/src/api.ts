import { visibleVehicleData } from './utils/vehicleVisibility';
import axios from 'axios';
import { Video, AnalysisTask, TaskResults } from './types';
import { BASE_URL, API_ENDPOINTS, getVideoStreamUrl, getNasStreamUrl } from './config';

const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
});

// ─────────────────────────────────────────────────────────────────────
// 鉴权：localStorage 持久化 token + axios 拦截器
//
// - 登录成功后调 setAuthToken(token) 写入；退出登录 / 401 时调 clearAuthToken()。
// - 拦截器读 localStorage（不依赖闭包变量，避免 React 严格模式下 hot reload
//   产生两份不一致的 token 状态）。
// - 401 自动清 token + 跳 /login？我们故意不在拦截器层做 hard redirect，
//   而是 emit 一个 window event，让 React 端的 AuthContext 决定如何处理
//   （SPA 不应该被 axios 强行 location.href，那会丢失 react-router 的 state）。
// ─────────────────────────────────────────────────────────────────────
export const AUTH_TOKEN_KEY = 'beeeval.auth.token';

export const getAuthToken = (): string | null => {
    try {
        return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
        return null;
    }
};

export const setAuthToken = (token: string) => {
    try {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
        /* ignore */
    }
};

export const clearAuthToken = () => {
    try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
        /* ignore */
    }
};

api.interceptors.request.use((cfg) => {
    const t = getAuthToken();
    if (t) {
        // axios v1 的 cfg.headers 是 AxiosHeaders 实例（永远不为 null/undefined）
        // 任意值都用 .set() 写，不要给 cfg.headers 自己赋值（类型不允许 plain {}）
        cfg.headers.set('Authorization', `Bearer ${t}`);
    }
    return cfg;
});

api.interceptors.response.use(
    (resp) => {
        // Hide models in read-only presentation data, never in account or write APIs.
        if (resp.config.method === 'get' && !/\/(auth|admin)\//.test(resp.config.url || '') && resp.config.responseType !== 'blob') {
            resp.data = visibleVehicleData(resp.data);
        }
        return resp;
    },
    (err) => {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail;
        if(status===403 && detail==='membership_upgrade_required')window.dispatchEvent(new Event('beeeval:upgrade-required'));
        if (status === 401) {
            // session 失效（未登录 / token 过期 / 被吊销）。
            clearAuthToken();
            window.dispatchEvent(new CustomEvent('beeeval:unauthorized', { detail }));
        } else if (status === 403 && detail === 'must_reset_password') {
            // 必须先改密；让上层弹改密窗
            window.dispatchEvent(new CustomEvent('beeeval:must-reset-password'));
        }
        return Promise.reject(err);
    },
);

export const listVideos = async (folderPath: string): Promise<{ videos: Video[] }> => {
    const response = await api.post(API_ENDPOINTS.LIST_VIDEOS, { folder_path: folderPath });
    return response.data;
};

export const analyzeVideos = async (
    folderPath: string,
    videoNames: string[],
    language: string = "zh",
    asrModel: string = "whisper"
): Promise<{ task_id: string }> => {
    const response = await api.post(API_ENDPOINTS.ANALYZE_VIDEOS, {
        folder_path: folderPath,
        video_names: videoNames,
        analysis_config: {
            evaluation_criteria: ["accuracy", "response_time", "user_experience", "context_awareness", "safety"]
        },
        language: language,
        asr_model: asrModel
    });
    return response.data;
};

export const getASRModels = async (): Promise<{ models: Array<{ value: string; label: string; description: string }>; default: string }> => {
    const response = await api.get('/video/asr-models');
    return response.data;
};

export const getResults = async (taskId: string, params?: { offset?: number; limit?: number; status?: string }): Promise<TaskResults & { total: number; offset: number; limit: number; failed_count: number; success_count: number; rows_total: number; status_counts: { completed: number; failed: number; invalid: number; skipped: number; processing: number; pending: number } }> => {
    const response = await api.get(`${API_ENDPOINTS.GET_RESULTS}/${taskId}`, { params });
    return response.data;
};

export const retryFailedVideos = async (taskId: string, asrModel: string = "whisper"): Promise<{ retried: number; task_id: string; message: string }> => {
    const response = await api.post(`${API_ENDPOINTS.RETRY_FAILED}/${taskId}`, null, { params: { asr_model: asrModel } });
    return response.data;
};

/** MiMo 链路失败视频重试（区别于 ASR+LLM 的 retryFailedVideos） */
export const retryFailedMimo = async (taskId: string): Promise<{ retried: number; task_id: string; message: string }> => {
    const response = await api.post(`/mimo/retry-failed/${taskId}`);
    return response.data;
};

export const recoverStuckVideos = async (taskId: string, asrModel: string = "whisper"): Promise<{ recovered: number; task_id: string; message: string }> => {
    const response = await api.post(`${API_ENDPOINTS.RECOVER_STUCK}/${taskId}`, null, { params: { asr_model: asrModel } });
    return response.data;
};

/** MiMo 任务恢复：一键重投所有卡住(pending/processing/queued)+失败的视频，无需重选文件夹 */
export const recoverStuckMimo = async (taskId: string): Promise<{ recovered: number; task_id: string; message: string }> => {
    const response = await api.post(`${API_ENDPOINTS.MIMO_RECOVER}/${taskId}`);
    return response.data;
};

export const forceCompleteTask = async (taskId: string): Promise<{ success: boolean; message: string; celery_purged?: number }> => {
    const response = await api.post(`${API_ENDPOINTS.FORCE_COMPLETE}/${taskId}`);
    return response.data;
};

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    offset: number;
    limit: number;
}

export const getTasks = async (params?: {
    offset?: number;
    limit?: number;
}): Promise<PaginatedResponse<AnalysisTask>> => {
    const response = await api.get(API_ENDPOINTS.GET_TASKS, { params });
    return response.data;
};

export const getAllResults = async (params?: {
    result_id?: string;
    offset?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    vehicle_id?: string;
    function_domain?: string;
    brand_model?: string;
    system_version?: string;
    status?: string;
    search?: string;
    /** 精确匹配 video_results.video_name；用于 Dr.bee 案例卡片跳转，避免 search 模糊命中错误记录 */
    video_name?: string;
    min_score?: number;
    max_score?: number;
    max_score_exclusive?: boolean;
    /** 精确匹配 video_results.case_id；用于「查同组」（同车型同用例 ID 的所有视频） */
    case_id?: string;
    /** 模糊匹配 video_results.case_id（子串）；用于「按用例筛选」ID 搜索 */
    case_id_search?: string;
    task_detail?: string;
    acceptance_tag?: string;
    /** 按分析批次过滤（analysis_tasks.id） */
    task_id?: string;
    /** true 时包含分析失败(status=failed)的记录；默认 false 排除 */
    include_failed?: boolean;
    /** true 时排除「待审核」(needs_review=true)记录；测试用例库用 */
    exclude_review?: boolean;
    /** true 时只看「待审核」记录；数据库页「只看待审核」用 */
    only_review?: boolean;
    /** 配合 only_review 按原因过滤：'duplicate'=重复用例 | 'model_flagged'=模型判定 */
    review_reason?: 'duplicate' | 'model_flagged';
    /** 按分诊分组过滤（metadata.triage.group）；分诊首页的分组明细页用 */
    triage_group?: string;
    /** 任务成败标注过滤：'unlabeled'=未标注 | 'success' | 'failed' */
    task_label?: 'unlabeled' | 'success' | 'failed';
    /** true 时只看 MiMo 多模态（与看板口径对齐） */
    only_mimo?: boolean;
    /** true 时只看 Claude 复审真订正过的 case（fix_hard/fix_soft 且分数变了，不含纯 flag，不区分 needs_review） */
    claude_corrected?: boolean;
    /** true 时把「待审核」记录排到最前；数据库页用 */
    review_first?: boolean;
    /** Lightweight media cards; full evidence is fetched separately on click. */
    index_only?: boolean;
}, requestOptions?: {signal?: AbortSignal}): Promise<PaginatedResponse<any>> => {
    const response = await api.get(API_ENDPOINTS.GET_ALL_RESULTS, { params, signal:requestOptions?.signal });
    return response.data;
};

/** 数据库页顶部看板统计 */
export interface VehicleOverviewItem {
    brand_model: string;
    system_version: string | null;
    total: number;
    reviewed: number;
    pending_review: number;
    /** 仅已通过记录的均分 */
    avg_score: number | null;
}

export interface ResultsOverview {
    total: number;
    reviewed: number;
    pending_review: number;
    invalid: number;
    failed: number;
    claude_corrected: number;
    by_vehicle: VehicleOverviewItem[];
    pending_reasons: { reason_type: 'duplicate' | 'model_flagged'; count: number }[];
    task_labeling: { labeled_success: number; labeled_failed: number; unlabeled: number };
}

export const getResultsOverview = async (brandModel?: string): Promise<ResultsOverview> => {
    const response = await api.get('/video/overview', { params: brandModel ? { brand_model: brandModel } : {} });
    return response.data;
};

/** 对单条记录只重跑 Claude 复审（不重跑 MiMo）。用于复审失败/降级的 case 一键重试。 */
export const reverifyResult = async (resultId: string): Promise<{ ok: boolean; status: string; detail: string; corrected: number }> => {
    const response = await api.post(`/video/result/${resultId}/reverify`);
    return response.data;
};

/** 批量重试所有 Claude 复审失败/降级的 case（后台串行）。 */
export const reverifyFailedBatch = async (brandModel?: string): Promise<{ status: string; total?: number }> => {
    const response = await api.post('/video/reverify-failed', null, { params: brandModel ? { brand_model: brandModel } : {} });
    return response.data;
};

export const getReverifyFailedProgress = async (): Promise<{ running: boolean; done: number; total: number; ok: number; failed: number }> => {
    const response = await api.get('/video/reverify-failed/progress');
    return response.data;
};

/** 视频ID总览：官方题库全部ID + 是否在库里存在 */
export interface CaseIdOverview {
    total: number;
    present_count: number;
    missing_count: number;
    items: { case_id: string; present: boolean }[];
}
export const getCaseIdOverview = async (brandModel?: string): Promise<CaseIdOverview> => {
    const response = await api.get('/video/case-id-overview', { params: brandModel ? { brand_model: brandModel } : {} });
    return response.data;
};

/** 批量审核：把选中记录标记为校验通过(reviewed=true→needs_review=false) */
export const batchReviewResults = async (
    ids: string[],
    reviewed = true,
): Promise<{ status: string; updated_count: number }> => {
    const response = await api.post('/video/results/batch-review', { ids, reviewed });
    return response.data;
};

/** 待审核分诊：分组 + 建议 + 按车型分布 */
export type TriageSuggestion = 'delete' | 'replace' | 'manual' | 'keep';

export interface TriageGroup {
    key: string;
    title: string;
    suggestion: TriageSuggestion;
    count: number;
    by_vehicle: { brand_model: string; system_version: string | null; count: number }[];
    sample_ids: string[];
}

export interface ReviewTriage {
    total_pending: number;
    groups: TriageGroup[];
}

export const getReviewTriage = async (recompute = false, brandModel?: string): Promise<ReviewTriage> => {
    const params: Record<string, any> = {};
    if (recompute) params.recompute = true;
    if (brandModel) params.brand_model = brandModel;
    const response = await api.get('/video/review-triage', { params });
    return response.data;
};

/** 对比视图：目标记录 + 库里同ID已通过记录，供审核弹窗并排展示 */
export interface CompareRecord {
    id: string;
    video_name: string;
    case_id: string | null;
    brand_model: string | null;
    system_version: string | null;
    function_domain: string | null;
    metadata: any;
    created_at: string;
    evaluation_scores: any[];
}

export interface OfficialCase {
    case_id: string;
    content: string | null;
    function_domain: string | null;
    task_detail: string | null;
    acceptance_tag: string | null;
}

export const getResultCompare = async (resultId: string): Promise<{
    target: CompareRecord;
    approved_same_id: CompareRecord[];
    // 同重复组里的其它【待审核】候选（整组都还没入库时供横向对比、择一入库）
    pending_same_id: CompareRecord[];
    official_case: OfficialCase | null;
}> => {
    const response = await api.get(`/video/result/${resultId}/compare`);
    return response.data;
};

/** 质量检查：已通过记录的「视频提取用例」vs「官方题库用例」语义比对 */
export interface QualityCheckRow {
    result_id: string;
    extracted_case_id: string;
    extracted_content: string;
    official_case_id: string | null;
    official_content: string | null;
    best_match_id: string | null;
    best_match_content: string | null;
    best_match_sim: number;
    suggest_id: string | null;
    group: 'consistent' | 'id_mismatch' | 'low_similarity';
    issue: string;
    brand_model: string | null;
    system_version: string | null;
}

export const getQualityCheck = async (brandModel?: string, group?: string): Promise<{
    counts: { consistent: number; id_mismatch: number; low_similarity: number };
    total: number;
    rows: QualityCheckRow[];
    computed_at?: string | null;
}> => {
    const params: Record<string, any> = {};
    if (brandModel) params.brand_model = brandModel;
    if (group) params.group = group;
    const response = await api.get('/video/quality-check', { params });
    return response.data;
};

/** 后台触发质量检查重算（慢，放后台）；前端轮询 progress */
export const recomputeQualityCheck = async (brandModel?: string): Promise<{ status: string }> => {
    const response = await api.post('/video/quality-check/recompute', null, { params: brandModel ? { brand_model: brandModel } : {} });
    return response.data;
};

export interface QCProgress {
    status: 'idle' | 'queued' | 'loading' | 'embedding' | 'scoring' | 'done' | 'error';
    phase?: string;
    done?: number;
    total?: number;
}

export const getQualityCheckProgress = async (brandModel?: string): Promise<QCProgress> => {
    const response = await api.get('/video/quality-check/progress', { params: brandModel ? { brand_model: brandModel } : {} });
    return response.data;
};

/** 批量修正系统ID(case_id)。auto=true 时自动修正质量检查里所有 id_mismatch 记录（按建议ID）。 */
export const batchFixCaseId = async (
    payload: { pairs?: { result_id: string; case_id: string }[]; auto?: boolean; brand_model?: string },
): Promise<{ status: string; updated_count: number }> => {
    const response = await api.post('/video/results/batch-fix-case-id', payload);
    return response.data;
};

/** 人工确认「与官方一致」：把选中记录的质量检查分组置为 consistent */
export const confirmQualityConsistent = async (resultIds: string[]): Promise<{ status: string; updated_count: number }> => {
    const response = await api.post('/video/quality-check/confirm-consistent', { result_ids: resultIds });
    return response.data;
};

/** 质量检查·去重：同一系统ID(case_id)有多条已通过记录的组 */
export interface DuplicateMember {
    result_id: string;
    video_name: string;
    user_question: string;
    system_response: string;
    score: string | null;
    created_at: string | null;
}
export interface DuplicateGroup {
    case_id: string;
    brand_model: string | null;
    system_version: string | null;
    official_content: string | null;
    members: DuplicateMember[];
}
export const getQualityDuplicates = async (brandModel?: string): Promise<{
    group_count: number;
    record_count: number;
    groups: DuplicateGroup[];
    computed_at?: string | null;
    cached?: boolean;
}> => {
    const response = await api.get('/video/quality-check/duplicates', { params: brandModel ? { brand_model: brandModel } : {} });
    return response.data;
};

/** 后台重扫重复ID（放后台，前端轮询进度） */
export const recomputeQualityDuplicates = async (brandModel?: string): Promise<{ status: string }> => {
    const response = await api.post('/video/quality-check/duplicates/recompute', null, { params: brandModel ? { brand_model: brandModel } : {} });
    return response.data;
};

export const getQualityDuplicatesProgress = async (brandModel?: string): Promise<QCProgress> => {
    const response = await api.get('/video/quality-check/duplicates/progress', { params: brandModel ? { brand_model: brandModel } : {} });
    return response.data;
};

export const recomputeReviewTriage = async (): Promise<{ status: string }> => {
    const response = await api.post('/video/review-triage/recompute');
    return response.data;
};

export const getReviewTriageProgress = async (): Promise<QCProgress> => {
    const response = await api.get('/video/review-triage/progress');
    return response.data;
};

/** 把某分诊分组全部待审核记录一次性校验通过入库（唯一记录用） */
export const approveTriageGroup = async (group: string, brandModel?: string): Promise<{ status: string; updated_count: number }> => {
    const response = await api.post('/video/review-triage/approve-group', { group, brand_model: brandModel });
    return response.data;
};

/** 分诊分组的「待审核 vs 库内已通过」配对（分页） */
export interface TriagePairSide {
    result_id: string;
    case_id: string;
    brand_model: string | null;
    system_version: string | null;
    user_question: string;
    score: string | null;
    // 对比候选是否也是「待审核」记录（true=同组另一条待审核；false/缺省=库内已通过）
    is_pending?: boolean;
}
export interface TriagePair {
    pending: TriagePairSide;
    library: TriagePairSide | null;
}
export const getTriagePairs = async (params: {
    triage_group: string; brand_model?: string; offset?: number; limit?: number;
}): Promise<{ total: number; offset: number; limit: number; pairs: TriagePair[] }> => {
    const response = await api.get('/video/review-triage/pairs', { params });
    return response.data;
};

export interface PKCaseItem {
    case_id: string;
    function_domain: string | null;
    user_question: string | null;
    scores: Record<string, { score: number | null; result_id: string }>;
}

export const getPKCases = async (params: {
    brand_models: string;
    function_domain?: string;
    offset?: number;
    limit?: number;
    /** 排序字段：'case_id' | 'function_domain' | `score:<brand_model>` */
    sort_by?: string;
    /** 'asc' | 'desc' */
    sort_dir?: string;
}): Promise<PaginatedResponse<PKCaseItem>> => {
    const response = await api.get(API_ENDPOINTS.PK_CASES, { params });
    return response.data;
};

export const getPKDetail = async (params: {
    case_id: string;
    brand_model_a: string;
    brand_model_b: string;
    system_version_a?: string;
    system_version_b?: string;
}): Promise<{ a: any; b: any }> => {
    const response = await api.get(API_ENDPOINTS.PK_DETAIL, { params });
    return response.data;
};

export const updateResult = async (id: string, data: any): Promise<{
    status: string;
    updated_fields: string[];
    response_quality_score?: number | null;
    quality_score_method?: string;
}> => {
    const response = await api.put(`${API_ENDPOINTS.UPDATE_RESULT}/${id}`, data);
    return response.data;
};

/** 完整指标库（扁平列表），供「增加指标」选择器用 */
export interface MetricRegistryItem {
    code: string;
    name: string;
    name_en?: string;
    category: string;
    definition?: string;
}

export const getMetricsRegistry = async (): Promise<MetricRegistryItem[]> => {
    const response = await api.get('/aggregation/metrics-registry');
    return response.data;
};

/** 某功能域的指标权重，供综合分实时重算用 */
export interface DomainWeightItem {
    metric_code: string;
    metric_name: string;
    weight: number;
}

export const getDomainWeights = async (functionDomain?: string): Promise<{
    function_domain: string | null;
    weights: DomainWeightItem[];
}> => {
    const response = await api.get('/aggregation/domain-weights', {
        params: functionDomain ? { function_domain: functionDomain } : {},
    });
    return response.data;
};

export const deleteResult = async (id: string): Promise<void> => {
    await api.delete(`${API_ENDPOINTS.DELETE_RESULT}/${id}`);
};

/** 对已有记录重新跑 MiMo 分析（删旧换新）。返回新建的分析任务信息。 */
export const reanalyzeResults = async (resultIds: string[]): Promise<{
    task_id: string;
    total_videos: number;
    status: string;
}> => {
    const response = await api.post('/mimo/reanalyze', { result_ids: resultIds });
    return response.data;
};

/** 分析批次（供批次筛选下拉用） */
export interface AnalysisBatch {
    id: string;
    created_at: string;
    source: string;
    folder_path: string;
    /** 全部结果条数（含 failed/invalid/needs_review），仅作参考 */
    result_count: number;
    /** 数据库页显示数：排除 failed/invalid（保留待审核） */
    db_count: number;
    /** 测试用例库显示数：再排除待审核（needs_review） */
    test_case_count: number;
}

export const getBatches = async (): Promise<AnalysisBatch[]> => {
    const response = await api.get('/video/batches');
    return response.data.batches;
};

export const deleteResultsBatch = async (ids: string[]): Promise<void> => {
    await api.delete(API_ENDPOINTS.DELETE_RESULTS_BATCH, { data: { ids } });
};

export const deleteTasksBatch = async (ids: string[]): Promise<void> => {
    await api.delete(API_ENDPOINTS.DELETE_TASKS_BATCH, { data: { ids } });
};

export const getFilterOptions = async (): Promise<{
    brand_models: string[];
    function_domains: string[];
    system_versions: string[];
}> => {
    const response = await api.get(API_ENDPOINTS.FILTER_OPTIONS);
    return response.data;
};

export const exportTestCasesExcel = async (params: Record<string, any>): Promise<Blob> => {
    const resp = await api.get('/video/export-results', { params, responseType: 'blob' });
    return resp.data;
};

export const getAnalysisStatus = async (taskId: string): Promise<any> => {
    const response = await api.get(`${API_ENDPOINTS.GET_STATUS}/${taskId}`);
    return response.data;
};

export const chatQuery = async (query: string, language: string = "zh"): Promise<{ answer: string }> => {
    const response = await api.post(API_ENDPOINTS.CHAT_QUERY, { query, language });
    return response.data;
};

export const translateText = async (text: string, targetLang: string): Promise<{ original: string, translated: string }> => {
    const response = await api.post(API_ENDPOINTS.TRANSLATE, { text, target_lang: targetLang });
    return response.data;
};

export const getVideoUrl = (path: string): string => {
    return getVideoStreamUrl(path);
};

// NAS API functions
export interface NasItem {
    name: string;
    path: string;
    is_dir: boolean;
    size: number | null;
    modified: number | null;
    mime: string | null;
    is_video: boolean;
}

export interface NasBrowseResponse {
    current_path: string;
    parent_path?: string;
    total: number;
    offset: number;
    items: NasItem[];
}

export const getNasStatus = async (): Promise<{ available: boolean; root?: string; roots?: string[]; message?: string }> => {
    const response = await api.get(API_ENDPOINTS.NAS_STATUS);
    return response.data;
};

export const browseNas = async (params?: {
    path?: string;
    type?: string;
    sort?: string;
    order?: string;
    offset?: number;
}): Promise<NasBrowseResponse> => {
    const response = await api.get(API_ENDPOINTS.NAS_BROWSE, { params });
    return response.data;
};

export const searchNas = async (params: {
    keyword: string;
    path?: string;
    depth?: number;
    limit?: number;
}): Promise<any> => {
    const response = await api.get(API_ENDPOINTS.NAS_SEARCH, { params });
    return response.data;
};

export const scanNasDirectory = async (nasPath: string): Promise<{
    nas_path: string;
    total_files: number;
    video_files: number;
    parsed_videos: any[];
}> => {
    const response = await api.post(API_ENDPOINTS.NAS_SCAN, { nas_path: nasPath });
    return response.data;
};

export const analyzeNasVideos = async (
    nasPaths: string[],
    asrModel: string = "whisper"
): Promise<{ task_id: string }> => {
    const response = await api.post(API_ENDPOINTS.ANALYZE_NAS, {
        nas_paths: nasPaths,
        analysis_config: {
            evaluation_criteria: ["accuracy", "response_time", "user_experience", "context_awareness", "safety"]
        },
        asr_model: asrModel,
    });
    return response.data;
};

export const getNasVideoUrl = (nasPath: string): string => {
    return getNasStreamUrl(nasPath);
};

/**
 * 让后端在「用户真的开始看了」之后，把这个 NAS 视频排进本地缓存 warm 队列。
 * 不要在弹窗一打开就调（会和实时流抢 NAS 带宽）；推荐 onLoadedData 之后调。
 * 后端是幂等的：已缓存或已在 warm 中的文件再调也只是 no-op。
 */
export const preloadNasVideo = async (nasPath: string): Promise<void> => {
    try {
        await api.post('/nas/cache/preload', { path: nasPath });
    } catch {
        // 静默失败：缓存只是优化，不影响播放
    }
};

// RAG API functions
export const vectorizeEvaluations = async (
    taskIds: string[],
    targetCollection?: string,
): Promise<{ vectorized_count: number; skipped_count: number; failed_count: number }> => {
    const response = await api.post('/rag/vectorize', {
        task_ids: taskIds,
        target_collection: targetCollection || undefined,
    });
    return response.data;
};

export interface VectorCollection {
    name: string;
    label: string;
    description: string;
    count: number | null;
}

export const getVectorCollections = async (): Promise<{ collections: VectorCollection[] }> => {
    const resp = await api.get('/rag/collections');
    return resp.data;
};

export const ragQuery = async (question: string, top_k: number = 20): Promise<{ answer: string; sources: any[] }> => {
    const response = await api.post('/rag/query', { question, top_k });
    return response.data;
};

// ───── 流式 RAG 问答（Ask AI 悬浮面板专用，固定 mimo + auto 模式）─────
//
// 后端走 SSE，事件类型：
//   - meta:    { model_key, model_name, selection_mode, retrieved_count, ... }
//   - sources: { sources: [...] }
//   - chunk:   { text: "增量片段" }
//   - done:    {}
//   - error:   { message }
//
// 前端用 fetch + ReadableStream 解析（EventSource 不支持 POST，所以不用它）。
//
// 调用方传一个 onEvent 回调，逐事件触发；done/error 后流自动结束。
export type RagStreamEvent =
    | { type: 'meta'; modelKey: string; modelName: string; selectionMode: 'auto' | 'manual'; retrievedCount: number; minScoreUsed: number | null; topScore: number | null; lowRelevance: boolean; intent?: DrBeeIntent | null; intentSource?: string | null; usedHyde?: boolean; usedAggregatedContext?: boolean }
    | { type: 'sources'; sources: any[] }
    | { type: 'chunk'; text: string }
    | { type: 'step'; id: string; status: 'active' | 'done' }
    | { type: 'done' }
    | { type: 'error'; message: string };

export const ragQueryStream = async (
    question: string,
    onEvent: (event: RagStreamEvent) => void,
    options?: { signal?: AbortSignal; channel?: 'drbee' | 'askai' },
): Promise<void> => {
    const url = `${BASE_URL}/rag/query/stream`;
    // fetch 不走 axios 拦截器，得手动带 token；同时手动处理 401（清 token + emit）
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question, channel: options?.channel ?? 'askai' }),
        signal: options?.signal,
    });

    if (resp.status === 401) {
        clearAuthToken();
        window.dispatchEvent(new CustomEvent('beeeval:unauthorized'));
        throw new Error('unauthorized');
    }

    if (!resp.ok || !resp.body) {
        throw new Error(`RAG stream failed: HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 用 \n\n 分隔事件
        let sep = buffer.indexOf('\n\n');
        while (sep !== -1) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            let event = 'message';
            const dataLines: string[] = [];
            for (const line of block.split('\n')) {
                if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            const dataStr = dataLines.join('\n');
            try {
                const data = dataStr ? JSON.parse(dataStr) : {};
                if (event === 'chunk' && typeof data.text === 'string') {
                    onEvent({ type: 'chunk', text: data.text });
                } else if (event === 'sources') {
                    onEvent({ type: 'sources', sources: Array.isArray(data.sources) ? data.sources : [] });
                } else if (event === 'meta') {
                    onEvent({
                        type: 'meta',
                        modelKey: data.model_key || '',
                        modelName: data.model_name || '',
                        selectionMode: (data.selection_mode === 'manual' ? 'manual' : 'auto'),
                        retrievedCount: typeof data.retrieved_count === 'number' ? data.retrieved_count : 0,
                        minScoreUsed: typeof data.min_score_used === 'number' ? data.min_score_used : null,
                        topScore: typeof data.top_score === 'number' ? data.top_score : null,
                        lowRelevance: !!data.low_relevance,
                        intent: (data.intent ?? null) as DrBeeIntent | null,
                        intentSource: data.intent_source ?? null,
                        usedHyde: !!data.used_hyde,
                        usedAggregatedContext: !!data.used_aggregated_context,
                    });
                } else if (event === 'step') {
                    onEvent({ type: 'step', id: data.id || '', status: data.status || 'active' });
                } else if (event === 'done') {
                    onEvent({ type: 'done' });
                } else if (event === 'error') {
                    onEvent({ type: 'error', message: data.message || 'unknown error' });
                }
            } catch (e) {
                // 单个事件解析失败不应中断整条流
                console.warn('SSE parse error', e, block);
            }

            sep = buffer.indexOf('\n\n');
        }
    }
};

// Dr.bee Lab 专用流式查询（指向 /drbee/query/stream，支持完整调试参数）
export const drBeeQueryStream = async (
    req: DrBeeQueryRequest,
    onEvent: (event: RagStreamEvent) => void,
    options?: { signal?: AbortSignal },
): Promise<void> => {
    const url = `${BASE_URL}/drbee/query/stream`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
        signal: options?.signal,
    });

    if (resp.status === 401) {
        clearAuthToken();
        window.dispatchEvent(new CustomEvent('beeeval:unauthorized'));
        throw new Error('unauthorized');
    }
    if (!resp.ok || !resp.body) {
        throw new Error(`DrBee stream failed: HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep = buffer.indexOf('\n\n');
        while (sep !== -1) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            let event = 'message';
            const dataLines: string[] = [];
            for (const line of block.split('\n')) {
                if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            const dataStr = dataLines.join('\n');
            try {
                const data = dataStr ? JSON.parse(dataStr) : {};
                if (event === 'chunk' && typeof data.text === 'string') {
                    onEvent({ type: 'chunk', text: data.text });
                } else if (event === 'sources') {
                    onEvent({ type: 'sources', sources: Array.isArray(data.sources) ? data.sources : [] });
                } else if (event === 'meta') {
                    onEvent({
                        type: 'meta',
                        modelKey: data.model_key || '',
                        modelName: data.model_name || '',
                        selectionMode: (data.selection_mode === 'manual' ? 'manual' : 'auto'),
                        retrievedCount: typeof data.retrieved_count === 'number' ? data.retrieved_count : 0,
                        minScoreUsed: typeof data.min_score_used === 'number' ? data.min_score_used : null,
                        topScore: typeof data.top_score === 'number' ? data.top_score : null,
                        lowRelevance: !!data.low_relevance,
                        intent: (data.intent ?? null) as DrBeeIntent | null,
                        intentSource: data.intent_source ?? null,
                        usedHyde: !!data.used_hyde,
                        usedAggregatedContext: !!data.used_aggregated_context,
                    });
                } else if (event === 'done') {
                    onEvent({ type: 'done' });
                } else if (event === 'error') {
                    onEvent({ type: 'error', message: data.message || 'unknown error' });
                }
            } catch (e) {
                console.warn('SSE parse error', e, block);
            }
            sep = buffer.indexOf('\n\n');
        }
    }
};

export const getVectorStats = async (): Promise<{ total_vectors: number; dimension: number; collection_name: string }> => {
    const response = await api.get('/rag/stats');
    return response.data;
};

export const deleteVideoVectors = async (videoName: string): Promise<{ status: string; message: string }> => {
    const response = await api.delete(`/rag/video/${encodeURIComponent(videoName)}`);
    return response.data;
};

export interface VectorPoint {
    id: string;
    video_name: string;
    user_question: string;
    system_response: string;
    summary: string;
    evaluations: any[];
    created_at: string;
    case_id: string;
    brand_model: string;
    system_version: string;
    function_domain: string;
    scenario: string;
    sequence: string;
}

export const listVectors = async (params?: {
    offset?: string;
    limit?: number;
    video_name?: string;
    brand_model?: string;
    function_domain?: string;
}): Promise<{ points: VectorPoint[]; next_offset: string | null; total: number }> => {
    const response = await api.get(API_ENDPOINTS.RAG_VECTORS, { params });
    return response.data;
};

export const getVectorFacets = async (): Promise<{
    video_names: string[];
    brand_models: string[];
    function_domains: string[];
}> => {
    const response = await api.get(API_ENDPOINTS.RAG_FACETS);
    return response.data;
};

export const deleteVectorsBatch = async (ids: string[]): Promise<{ status: string; deleted: number }> => {
    const response = await api.post(API_ENDPOINTS.RAG_VECTORS_DELETE_BATCH, { ids });
    return response.data;
};

export const clearVectors = async (): Promise<{ status: string; message: string }> => {
    const response = await api.post(API_ENDPOINTS.RAG_VECTORS_CLEAR);
    return response.data;
};

export const updateVector = async (pointId: string, payload: Partial<VectorPoint> & { re_embed?: boolean }): Promise<{ status: string; id: string; re_embedded: boolean }> => {
    const response = await api.put(`${API_ENDPOINTS.RAG_VECTORS}/${pointId}`, payload);
    return response.data;
};

// ────────────────────────────────────────────────────────────────────
// Vehicle Aggregated Scores
// ────────────────────────────────────────────────────────────────────
export interface VehicleListItem {
    brand_model: string;
    system_version: string | null;
    /** 已评测题目数（去重）：已完成且在题库内的 case_id 去重计数 */
    video_count: number;
    /** 题库总 case 数（分母），用于展示「已评 / 总量」 */
    pool_total: number;
    has_cache: boolean;
    last_computed_at: string | null;
    eval_version?: string | null;
    scoring_version?: string | null;
    scoring_note?: string | null;
    is_current_scoring?: boolean;
    is_partial_scoring?: boolean;
    /** 该车总均分（功能域均分的算术平均），仅 has_cache=true 且功能域非空时有值 */
    overall_score: number | null;
    /** 该车用例均分（所有 case Overall Score 的算术平均），按 case 加权 */
    case_avg_score: number | null;
    /** 测试采集时间「YYYY-MM」：由后端从测试视频路径派生，作为该 OTA 版本上线时间的近似，
     *  供整车评分矩阵图横轴用。查不到为 null（该车在矩阵图里不显示）。 */
    capture_date: string | null;
}

export interface DimensionScore {
    dimension_key: string;
    avg_score: number;
    sample_count: number;
}

export interface VehicleScoreSnapshot {
    brand_model: string;
    system_version: string | null;
    last_computed_at: string | null;
    criteria_scores: DimensionScore[];
    function_domain_scores: DimensionScore[];
    eval_version?: string | null;
    scoring_version?: string | null;
    scoring_note?: string | null;
    is_current_scoring?: boolean;
    is_partial_scoring?: boolean;
    /** 总均分（功能域均分的算术平均），仅在功能域非空时有值 */
    overall_score: number | null;
    /** 参与计算总均分的功能域数量 */
    overall_domain_count: number | null;
    /** 参与计算总均分的样本总数（≈所有功能域样本之和） */
    overall_sample_count: number | null;
    /** 用例均分（所有 case Overall Score 的算术平均），按 case 加权 */
    case_avg_score: number | null;
    /** 参与计算用例均分的 case 数量 */
    case_count: number | null;
}

export const listVehiclesForAggregation = async (): Promise<VehicleListItem[]> => {
    const response = await api.get(API_ENDPOINTS.AGGREGATION_VEHICLES);
    return response.data;
};

export const getVehicleAggregatedScores = async (
    brand_model: string,
    system_version?: string | null,
): Promise<VehicleScoreSnapshot> => {
    const params: Record<string, string> = { brand_model };
    if (system_version) params.system_version = system_version;
    const response = await api.get(API_ENDPOINTS.AGGREGATION_VEHICLE, { params, timeout: 15000 });
    return response.data;
};

export const computeVehicleAggregatedScores = async (
    brand_model: string,
    system_version?: string | null,
): Promise<VehicleScoreSnapshot> => {
    const response = await api.post(API_ENDPOINTS.AGGREGATION_VEHICLE_COMPUTE, {
        brand_model,
        system_version: system_version || null,
    });
    return response.data;
};

export const compareVehicles = async (
    vehicles: Array<{ brand_model: string; system_version?: string | null }>,
): Promise<VehicleScoreSnapshot[]> => {
    const response = await api.post(API_ENDPOINTS.AGGREGATION_COMPARE, { vehicles });
    return response.data;
};

/** 管理员「更新评分」弹窗用：所有有 MiMo 数据的车（含未进板块的）。 */
export interface MimoVehicleItem {
    brand_model: string;
    system_version: string | null;
    mimo_sample_count: number;
    domain_count: number;       // 覆盖的规范功能域数（满6为齐全）
    in_board: boolean;          // 是否已在评分板块（有重算缓存）
    last_computed_at: string | null;
}

export interface RecomputeResult {
    count: number;
    computed: string[];
    failed: string[];
}

/** 管理员：拉取所有有 MiMo 数据的车，供弹窗勾选。 */
export const listMimoVehicles = async (): Promise<MimoVehicleItem[]> => {
    const response = await api.get(API_ENDPOINTS.AGGREGATION_MIMO_VEHICLES);
    return response.data;
};

/** 管理员：重算勾选的车（= 确认进板块）。未勾选的不受影响。 */
export const recomputeVehicles = async (
    vehicles: Array<{ brand_model: string; system_version?: string | null }>,
): Promise<RecomputeResult> => {
    const response = await api.post(API_ENDPOINTS.AGGREGATION_RECOMPUTE, {
        vehicles: vehicles.map(v => ({
            brand_model: v.brand_model,
            system_version: v.system_version || null,
        })),
    });
    return response.data;
};

/** 管理员：把某车撤出评分板块（删缓存）。 */
export const removeVehicleFromBoard = async (
    brand_model: string,
    system_version: string | null,
): Promise<{ status: string }> => {
    const response = await api.post(API_ENDPOINTS.AGGREGATION_REMOVE, {
        brand_model,
        system_version: system_version || null,
    });
    return response.data;
};

export const getAllVehicleScores = async (): Promise<VehicleScoreSnapshot[]> => {
    const response = await api.get(API_ENDPOINTS.AGGREGATION_ALL_SCORES);
    return response.data;
};

export interface DomainCriteriaItem {
    function_domain: string;
    criteria: DimensionScore[];
}

export const getCriteriaByDomain = async (
    brand_model: string,
    system_version?: string | null,
): Promise<DomainCriteriaItem[]> => {
    const params: Record<string, string> = { brand_model };
    if (system_version) params.system_version = system_version;
    const response = await api.get(API_ENDPOINTS.AGGREGATION_CRITERIA_BY_DOMAIN, { params });
    return response.data;
};

export interface VehicleTaskCompletion {
    metric_code: string;
    metric_name: string;
    brand_model: string;
    system_version: string | null;
    success: number;
    failed: number;
    unknown: number;
    total: number;
    completion_rate: number | null;
}

// MiMo 链路任务完成率（A11）。仅统计 analysis_source=mimo-v2.5 的结果，不含 Gemini。
export const getVehicleTaskCompletion = async (
    brand_model: string,
    system_version?: string | null,
): Promise<VehicleTaskCompletion> => {
    const params: Record<string, string> = { brand_model };
    if (system_version) params.system_version = system_version;
    const response = await api.get(API_ENDPOINTS.AGGREGATION_TASK_COMPLETION, { params });
    return response.data;
};

// ---- 验收评价：按「验收梯度」分层的任务完成率 ----

/** 单个验收梯度下的完成率统计（成功/失败/未判定 + 完成率 + 用例数）。 */
export interface AcceptanceGradeStat {
    success: number;
    failed: number;
    unknown: number;
    total: number;
    /** 该梯度下参与统计的用例数量（含未判定），用于图上标注 */
    case_count: number;
    /** 完成率 = 成功数 / 已判定数(成功+失败)，无已判定样本时为 null */
    completion_rate: number | null;
}

export interface AcceptanceDomainItem {
    function_domain: string;
    /** key 为验收梯度名（基础验收/中等验收/进阶验收） */
    grades: Record<string, AcceptanceGradeStat>;
}

export interface VehicleAcceptanceCompletion {
    brand_model: string;
    system_version: string | null;
    /** 验收梯度展示顺序（由易到难） */
    grades: string[];
    /** 全功能域合计的各梯度完成率 */
    overall: Record<string, AcceptanceGradeStat>;
    /** 每个功能域下的各梯度完成率 */
    by_domain: AcceptanceDomainItem[];
}

// MiMo 链路按验收梯度分层的任务完成率（验收评价模块）。仅统计 analysis_source=mimo-v2.5。
export const getVehicleAcceptanceCompletion = async (
    brand_model: string,
    system_version?: string | null,
): Promise<VehicleAcceptanceCompletion> => {
    const params: Record<string, string> = { brand_model };
    if (system_version) params.system_version = system_version;
    const response = await api.get(API_ENDPOINTS.AGGREGATION_ACCEPTANCE_COMPLETION, { params });
    return response.data;
};

// ---- 验收评价：某功能域下，各梯度按任务类型(task_detail)细分的完成率 ----

/** 单个任务类型的完成率统计（继承 AcceptanceGradeStat + task_detail 名）。 */
export interface TaskDetailStat extends AcceptanceGradeStat {
    task_detail: string;
    /** 该任务的 5 分制得分（response_quality_score 均值，0-5），无有效样本为 null */
    score?: number | null;
    /** 参与得分均值的样本数 */
    score_count?: number;
}

export interface AcceptanceGradeTaskGroup {
    grade: string;
    /** 该梯度合并所有任务类型后的整体完成率（供小标题用） */
    grade_stat: AcceptanceGradeStat;
    /** 该梯度下各任务类型的完成率，按完成率降序 */
    task_details: TaskDetailStat[];
}

export interface VehicleAcceptanceTaskDetail {
    brand_model: string;
    system_version: string | null;
    function_domain: string;
    grades: string[];
    by_grade: AcceptanceGradeTaskGroup[];
}

// 某功能域下，各梯度按任务类型细分的完成率。仅统计 analysis_source=mimo-v2.5。
export const getVehicleAcceptanceTaskDetail = async (
    brand_model: string,
    function_domain: string,
    system_version?: string | null,
): Promise<VehicleAcceptanceTaskDetail> => {
    const params: Record<string, string> = { brand_model, function_domain };
    if (system_version) params.system_version = system_version;
    const response = await api.get(API_ENDPOINTS.AGGREGATION_ACCEPTANCE_TASK_DETAIL, { params });
    return response.data;
};

// 某功能域 + 任务类型下的所有用例（完整 video_results 行，供卡片弹窗用）。
export const getTaskDetailCases = async (
    brand_model: string,
    function_domain: string,
    task_detail: string,
    system_version?: string | null,
    acceptance_tag?: string | null,
): Promise<{ data: any[]; total: number }> => {
    const params: Record<string, string> = { brand_model, function_domain, task_detail };
    if (system_version) params.system_version = system_version;
    if (acceptance_tag) params.acceptance_tag = acceptance_tag;
    const response = await api.get(API_ENDPOINTS.AGGREGATION_TASK_DETAIL_CASES, { params });
    return response.data;
};

// ---- 指标基线：AI核心指标 ----

/** 单个核心指标基线数据。kind 决定值的量纲：
 *  score=5分制均分(0-5)、percent=完成率(0-1)、latency=首次响应时长(ms)、speed=输出速度(字/秒)。 */
export interface CoreMetricBaseline {
    code: string;
    name: string;
    name_en: string;
    subcategory: string;   // 二级指标，如 C1-自然语言
    category: string;      // 一级指标，如 Cognition认知
    kind: 'score' | 'percent' | 'latency' | 'speed';
    value: number | null;
    sample_count: number;
}

export interface VehicleMetricsBaseline {
    brand_model: string;
    system_version: string | null;
    metrics: CoreMetricBaseline[];
}

// 某车 AI核心指标基线（5分制均分 + 特殊指标数值）。仅统计 analysis_source=mimo-v2.5。
export const getVehicleMetricsBaseline = async (
    brand_model: string,
    system_version?: string | null,
): Promise<VehicleMetricsBaseline> => {
    const params: Record<string, string> = { brand_model };
    if (system_version) params.system_version = system_version;
    const response = await api.get(API_ENDPOINTS.AGGREGATION_METRICS_BASELINE, { params });
    return response.data;
};

/** 某指标在各功能域下的细分值。 */
export interface MetricDomainBreakdown {
    brand_model: string;
    system_version: string | null;
    metric_code: string;
    metric_name: string;
    kind: 'score' | 'percent' | 'latency' | 'speed';
    domains: Array<{ function_domain: string; value: number | null; sample_count: number }>;
}

// 某核心指标在各功能域的细分值（点击指标下钻用）。仅统计 analysis_source=mimo-v2.5。
export const getMetricDomainBreakdown = async (
    brand_model: string,
    metric_code: string,
    system_version?: string | null,
): Promise<MetricDomainBreakdown> => {
    const params: Record<string, string> = { brand_model, metric_code };
    if (system_version) params.system_version = system_version;
    const response = await api.get(API_ENDPOINTS.AGGREGATION_METRIC_DOMAIN_BREAKDOWN, { params });
    return response.data;
};

export const getMetricsMap = async (): Promise<Record<string, string>> => {
    const response = await api.get(API_ENDPOINTS.AGGREGATION_METRICS_MAP);
    return response.data;
};

export const getDomainsMap = async (): Promise<Record<string, string>> => {
    const response = await api.get(API_ENDPOINTS.AGGREGATION_DOMAINS_MAP);
    return response.data;
};

/** 任务类型(task_detail)中→英映射 */
export const getTaskDetailMap = async (): Promise<Record<string, string>> => {
    const response = await api.get(API_ENDPOINTS.AGGREGATION_TASK_DETAIL_MAP);
    return response.data;
};

/** 车型品牌中→英映射（{中文前缀: 英文}） */
export const getBrandMap = async (): Promise<Record<string, string>> => {
    const response = await api.get(API_ENDPOINTS.AGGREGATION_BRAND_MAP);
    return response.data;
};

// ────────────────────────────────────────────────────────────────────
// Dr.bee 调试台
// ────────────────────────────────────────────────────────────────────
export interface DrBeeModelOption {
    key: string;
    label: string;
    model_name: string;
}

export interface DrBeeConfig {
    default_system_instruction: string;
    default_prompt_template: string;
    required_placeholders: string[];
    optional_placeholders: string[];
    models: DrBeeModelOption[];
    default_model_key: string;
    /** Auto 模式默认相似度阈值（0~1） */
    default_min_score: number;
    /** Auto 模式兜底最小返回条数 */
    rag_min_k: number;
    /** Auto 模式上限条数 */
    rag_max_k: number;
}

export type DrBeeSelectionMode = "auto" | "manual";

export interface DrBeeSource {
    video_name: string | null;
    video_path: string | null;
    user_question: string | null;
    system_response: string | null;
    summary: string | null;
    score: number | null;
    brand_model: string | null;
    brand_model_en: string | null;
    system_version: string | null;
    function_domain: string | null;
    /** "case"（视频案例）或 "vehicle_summary"（一台车的整体汇总卡） */
    doc_type?: string | null;
    evaluations?: Array<{ criteria?: string; metric_name?: string; score?: number | null; feedback?: string; category?: string }> | null;
    created_at?: string | null;
}

export type DrBeeIntent =
    | 'case_lookup'
    | 'ranking'
    | 'aggregation'
    | 'comparison'
    | 'vehicle_detail_lookup';

export interface DrBeeQueryResponse {
    answer: string;
    sources: DrBeeSource[];
    model_key: string;
    model_name: string;
    llm_latency_ms: number;
    total_latency_ms: number;
    retrieved_count: number;
    selection_mode: DrBeeSelectionMode;
    /** Auto 模式下实际生效的阈值；manual 时为 null */
    min_score_used: number | null;
    /** 候选池中 top1 的 cosine 相似度；manual 时为 null */
    top_score: number | null;
    /** 是否触发兜底（样本相关度偏低） */
    low_relevance: boolean;
    /** 意图分类结果（用于前端调试栏展示） */
    intent?: DrBeeIntent | null;
    /** 分类结果来源：rule / llm / fallback / *_cached */
    intent_source?: string | null;
    /** 实际是否走了 HyDE（缓存命中也算 true） */
    used_hyde?: boolean;
    /** 聚合数据缺失等无数据原因（前端可渲染引导卡片） */
    no_data_reason?: string | null;
}

export interface DrBeeQueryRequest {
    question: string;
    prompt_template?: string;
    system_instruction?: string;
    model_key?: string;
    top_k?: number;
    selection_mode?: DrBeeSelectionMode;
    min_score?: number | null;
    /** Lab 调试用：是否启用 HyDE（先让 LLM 写假答案再检索） */
    use_hyde?: boolean;
    /** Lab 调试用：是否启用意图路由（默认开） */
    use_intent_router?: boolean;
    /** 会话 channel：drbee | askai（默认 drbee） */
    channel?: 'drbee' | 'askai';
}

export interface DrBeeSessionListItem {
    id: number;
    title: string | null;
    model_key: string | null;
    model_name: string;
    user_question: string;
    llm_latency_ms: number | null;
    total_latency_ms: number | null;
    top_k: number | null;
    created_at: string;
    selection_mode: DrBeeSelectionMode | null;
    min_score: number | null;
    top_score: number | null;
    low_relevance: boolean | null;
}

export interface DrBeeSessionDetail extends DrBeeSessionListItem {
    prompt_template: string;
    answer: string;
    retrieved_sources: DrBeeSource[];
}

export interface DrBeeReplayResponse {
    original: DrBeeSessionDetail;
    replay: DrBeeQueryResponse;
}

export const getDrBeeConfig = async (): Promise<DrBeeConfig> => {
    const response = await api.get(API_ENDPOINTS.DRBEE_CONFIG);
    return response.data;
};

export const drBeeQuery = async (req: DrBeeQueryRequest): Promise<DrBeeQueryResponse> => {
    const response = await api.post(API_ENDPOINTS.DRBEE_QUERY, req);
    return response.data;
};

// 历史说明：Dr.bee Agent 模式（drbee_agent.py + /drbee/query-agent）已在 Phase 1
// 统一编排器重构时移除。前端原来的 DrBeeAgentQueryRequest / drBeeAgentQuery /
// DRBEE_AGENT_QUERY / DrBeeQueryResponse.tool_calls_log 也跟着删了。

export const resetDrBeeChat = async (channel: 'drbee' | 'askai' = 'drbee'): Promise<void> => {
    await api.post('/drbee/chat/reset', { channel });
};

export const getDrBeeChatHistory = async (channel: 'drbee' | 'askai' = 'drbee'): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> => {
    const response = await api.get('/drbee/chat/history', { params: { channel } });
    return response.data.messages ?? [];
};

export const resetAskAiChat = async (channel: 'drbee' | 'askai' = 'askai'): Promise<void> => {
    await api.post('/drbee/chat/reset', { channel });
};

export const listDrBeeSessions = async (params?: { limit?: number; offset?: number }): Promise<DrBeeSessionListItem[]> => {
    const response = await api.get(API_ENDPOINTS.DRBEE_SESSIONS, { params });
    return response.data;
};

export const getDrBeeSession = async (id: number): Promise<DrBeeSessionDetail> => {
    const response = await api.get(`${API_ENDPOINTS.DRBEE_SESSIONS}/${id}`);
    return response.data;
};

export const saveDrBeeSession = async (payload: {
    title?: string | null;
    prompt_template: string;
    model_key: string;
    model_name: string;
    user_question: string;
    answer: string;
    llm_latency_ms: number;
    total_latency_ms: number;
    top_k: number;
    retrieved_sources: DrBeeSource[];
    selection_mode?: DrBeeSelectionMode;
    min_score?: number | null;
    top_score?: number | null;
    low_relevance?: boolean;
}): Promise<DrBeeSessionDetail> => {
    const response = await api.post(API_ENDPOINTS.DRBEE_SESSIONS, payload);
    return response.data;
};

export const deleteDrBeeSession = async (id: number): Promise<void> => {
    await api.delete(`${API_ENDPOINTS.DRBEE_SESSIONS}/${id}`);
};

export const replayDrBeeSession = async (id: number): Promise<DrBeeQueryResponse> => {
    const response = await api.post(`${API_ENDPOINTS.DRBEE_SESSIONS}/${id}/replay`);
    return response.data;
};

// ─────────────────────────────────────────────────────────────────────
// Auth / 账号管理
// ─────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'analyst' | 'tester' | 'viewer';

export interface UserPublic {
    id: number;
    username: string;
    display_name: string | null;
    role: UserRole;
    membership_tier?: 'free'|'base'|'plus'|'pro'|'max'|'trial'|null;
    scenario_enabled?: boolean;
    registration_source?: 'wechat'|'website';
    status?: string;
    is_active: boolean;
    must_reset_pwd: boolean;
    created_at: string;
    last_login_at: string | null;
    /** 账号到期时间（ISO8601, UTC）。null/undefined = 永久有效。 */
    expires_at?: string | null;
    /** 体验员数据可见截止时间。null = 不限制。 */
    data_visible_until?: string | null;
}

export interface LoginResponse {
    access_token: string;
    token_type: 'bearer';
    user: UserPublic;
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
    const resp = await api.post('/auth/login', { username, password });
    return resp.data;
};
export const migrateUnifiedSession = async (): Promise<void> => {
    await api.post('/auth/sso-session', {});
};

/** 账号申请（匿名，登录页用）。填邮箱+单位+理由，其他由管理员审批时配置。 */
export const applyForAccount = async (email: string, organization: string, apply_reason: string): Promise<{ status: string }> => {
    const resp = await api.post('/auth/apply', { email, organization, apply_reason });
    return resp.data;
};

export const me = async (): Promise<UserPublic> => {
    const resp = await api.get('/auth/me');
    return resp.data;
};

export const changePassword = async (
    new_password: string,
    old_password?: string,
): Promise<{ status: 'ok'; must_relogin: boolean }> => {
    // 后端：must_reset_pwd 用户首次改密可省略 old_password；其它情况必传。
    // 成功后 password_version+=1，**所有旧 token 立即失效**（含本次的），
    // 前端必须 clearAuthToken + 跳 /login。
    const payload: any = { new_password };
    if (old_password) payload.old_password = old_password;
    const resp = await api.post('/auth/change-password', payload);
    return resp.data;
};

export const logoutApi = async (): Promise<void> => {
    try {
        await api.post('/auth/logout');
    } catch {
        /* logout 是 fire-and-forget；后端没接通也无所谓 */
    }
};

// ── admin 管理用户 ──
export const adminListUsers = async (): Promise<UserPublic[]> => {
    const resp = await api.get('/admin/users');
    return resp.data;
};

export const adminCreateUser = async (payload: {
    username: string;
    password: string;
    role: UserRole;
    display_name?: string | null;
    membership_tier?: 'free'|'base'|'plus'|'pro'|'trial'|null;
    scenario_enabled?: boolean;
    must_reset_pwd?: boolean;
    /** ISO8601 字符串；与 expires_days 二选一 */
    expires_at?: string | null;
    /** 自今天起多少天后到期；与 expires_at 二选一；不传/null = 永久 */
    expires_days?: number | null;
}): Promise<UserPublic> => {
    const resp = await api.post('/admin/users', payload);
    return resp.data;
};

// ─── 账号申请审批 ───────────────────────────────────────────────
export interface AccountApplication {
    id: number;
    username: string;       // = 申请邮箱
    organization: string | null;  // 申请单位
    apply_reason: string | null;  // 申请理由
    created_at: string | null;
}

export const adminListApplications = async (): Promise<AccountApplication[]> => {
    const resp = await api.get('/admin/users/applications');
    return resp.data;
};

export const adminApproveApplication = async (
    id: number,
    payload: {
        role: UserRole;
        membership_tier?: 'free'|'base'|'plus'|'pro'|'trial'|null;
        scenario_enabled?: boolean;
        display_name?: string | null;
        department?: string | null;
        expires_at?: string | null;
        expires_days?: number | null;
        email_lang?: 'zh' | 'en';
    },
): Promise<UserPublic> => {
    const resp = await api.post(`/admin/users/applications/${id}/approve`, payload);
    return resp.data;
};

export const adminRejectApplication = async (id: number): Promise<void> => {
    await api.post(`/admin/users/applications/${id}/reject`);
};

export interface UserFocusTimeStat {
    user_id: number;
    username: string;
    display_name: string | null;
    total_seconds: number;
    total_display: string;
    last_active_at: string | null;
}

export const adminGetUsersFocusTime = async (): Promise<UserFocusTimeStat[]> => {
    const resp = await api.get('/admin/users/focus-time');
    return resp.data;
};

export const adminUpdateUser = async (
    id: number,
    payload: {
        role?: UserRole;
        membership_tier?: 'free'|'base'|'plus'|'pro'|'max'|'trial';
        scenario_enabled?: boolean;
        expected_scenario_enabled?: boolean;
        expected_membership_tier?: string|null;
        display_name?: string | null;
        is_active?: boolean;
        /** 显式清除到期时间 → 改成永久；优先级高于 expires_at / expires_days */
        clear_expires?: boolean;
        expires_at?: string | null;
        expires_days?: number | null;
    },
): Promise<UserPublic> => {
    const resp = await api.patch(`/admin/users/${id}`, payload);
    return resp.data;
};

export const adminResetUserPassword = async (
    id: number,
    new_password: string,
): Promise<{ ok: true }> => {
    const resp = await api.post(`/admin/users/${id}/reset-password`, { new_password });
    return resp.data;
};

export const adminDeleteUser = async (id: number): Promise<void> => {
    await api.delete(`/admin/users/${id}`);
};

// ── 批量开通账号 ──
export interface BulkPreviewRow {
    membership_tier?: 'free'|'base'|'plus'|'pro'|'trial'|null;
    scenario_enabled?: boolean;
    row_no: number;
    email: string;
    display_name: string;
    role: UserRole;
    department: string;
    error: string;
    exists: boolean;
    /** Excel 里填的"到期天数"。null = 留空 → commit 时走批次默认 */
    expires_days?: number | null;
}

export interface BulkPreviewResponse {
    total: number;
    valid: number;
    invalid: number;
    existing: number;
    rows: BulkPreviewRow[];
    smtp_configured: boolean;
}

export interface BulkCommitRowResult {
    membership_tier?: 'free'|'base'|'plus'|'pro'|'trial'|null;
    scenario_enabled?: boolean;
    row_no: number;
    email: string;
    display_name: string;
    role: UserRole;
    department: string;
    status: 'created' | 'created_no_email' | 'skipped_exists' | 'skipped_invalid' | 'failed';
    detail: string;
}

export interface BulkCommitResponse {
    total: number;
    created: number;
    skipped: number;
    failed: number;
    rows: BulkCommitRowResult[];
}

/** 直接拿到模板 xlsx 的下载链接（让 a 标签触发浏览器原生下载，
 *  比走 axios 拿 blob 再 createObjectURL 多余一步）。
 *  axios 拦截器会给所有 /admin/* 加 Bearer，但浏览器直接打 <a href> 不走拦截器；
 *  这里要单独签一个简易方法：用 fetch + blob 完成"带 token 下载"。 */
export const adminDownloadBulkTemplate = async (): Promise<Blob> => {
    const resp = await api.get('/admin/users/bulk/template', { responseType: 'blob' });
    return resp.data as Blob;
};

export const adminBulkPreview = async (file: File): Promise<BulkPreviewResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await api.post('/admin/users/bulk/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return resp.data;
};

export const adminBulkCommit = async (payload: {
    rows: Array<{
        email: string;
        display_name: string;
        role: UserRole;
        membership_tier?: 'free'|'base'|'plus'|'pro'|'trial'|null;
        scenario_enabled?: boolean;
        department: string;
        /** 行级到期天数（0 = 永久，1–3650 = 天数）；null / undefined 使用批次默认 */
        expires_days?: number | null;
    }>;
    email_lang: 'zh' | 'en';
    skip_email?: boolean;
    /** 整批账号统一的到期时间 ISO8601；与 expires_days 二选一；都不传 = 永久 */
    expires_at?: string | null;
    expires_days?: number | null;
}): Promise<BulkCommitResponse> => {
    const resp = await api.post('/admin/users/bulk/commit', payload);
    return resp.data;
};

export const adminTestSmtp = async (): Promise<{ ok: boolean; detail: string; configured: boolean }> => {
    const resp = await api.post('/admin/users/bulk/test-smtp');
    return resp.data;
};

// ─────────────────────────────────────────────────────────────────────
// 视频签名 URL（前端 <video> 没法带 Authorization 头，所以走短效 token）
// ─────────────────────────────────────────────────────────────────────
export type VideoQuality = 'auto' | 'proxy' | 'original';

export interface SignedVideoUrl {
    url: string;          // 已带 ?path=...&token=... 的可播放 URL（相对路径，前端要自行拼 BASE_URL）
    token: string;
    expires_in: number;   // 秒
    path: string;
    /** 实际签发档：proxy=1080p 代理流，original=原片 */
    quality?: 'proxy' | 'original' | string;
    /** 代理流是否已在服务端本地就绪 */
    proxy_ready?: boolean;
}

/** 自动判定 local / nas；NAS 默认 quality=auto → 1080p 代理流 */
export const signVideo = async (
    path: string,
    source: 'local' | 'nas' | 'auto' = 'auto',
    quality: VideoQuality = 'auto',
): Promise<SignedVideoUrl> => {
    const resp = await api.post('/video/stream/sign', { path, source, quality });
    return resp.data;
};

export const signLocalVideo = (path: string) => signVideo(path, 'local');
export const signNasVideo = (path: string, quality: VideoQuality = 'auto') => signVideo(path, 'nas', quality);

// ─────────────────────────────────────────────────────────────────────
// AskAI 问答日志（管理员）
// ─────────────────────────────────────────────────────────────────────
export interface AskaiLogFilters {
    user_id?: number;
    status?: string;
    model_key?: string;
    keyword?: string;
    low_relevance?: boolean;
    start?: string;
    end?: string;
}

export interface AskaiLogItem {
    id: number;
    user_id: number | null;
    username_snapshot: string;
    display_snapshot: string | null;
    channel: string;
    question: string;
    status: string;
    no_data_reason: string | null;
    model_key: string | null;
    model_name: string | null;
    started_at: string | null;
    llm_latency_ms: number | null;
    total_latency_ms: number;
    low_relevance: boolean | null;
    retrieved_count: number;
    has_sources: boolean;
    created_at: string | null;
}

export interface AskaiLogListResponse {
    total: number;
    items: AskaiLogItem[];
}

export const adminListAskaiLogs = async (
    params: AskaiLogFilters & { limit?: number; offset?: number },
): Promise<AskaiLogListResponse> => {
    const resp = await api.get('/admin/askai/logs', { params });
    return resp.data;
};

export const adminGetAskaiLog = async (id: number): Promise<Record<string, unknown>> => {
    const resp = await api.get(`/admin/askai/logs/${id}`);
    return resp.data;
};

export interface AskaiStatsSummary {
    total: number;
    low_relevance_count: number;
    avg_total_latency_ms: number | null;
    avg_llm_latency_ms: number | null;
    by_status: Array<{ status: string; count: number }>;
    trend: Array<{ bucket: string; count: number; avg_total_latency_ms: number | null }>;
}

export const adminAskaiStatsSummary = async (
    params: { start: string; end?: string; bucket?: 'day' | 'week' },
): Promise<AskaiStatsSummary> => {
    const resp = await api.get('/admin/askai/stats/summary', { params });
    return resp.data;
};

export interface AskaiStatsTopN {
    top_users: Array<{ user_id: number | null; username: string; count: number }>;
    top_no_data_questions: Array<{ question: string; count: number }>;
    top_low_relevance_questions: Array<{ question: string; count: number }>;
}

export const adminAskaiStatsTopN = async (
    params: { start: string; end?: string; limit?: number },
): Promise<AskaiStatsTopN> => {
    const resp = await api.get('/admin/askai/stats/topn', { params });
    return resp.data;
};

export const adminExportAskaiLogs = async (params: AskaiLogFilters): Promise<Blob> => {
    const resp = await api.get('/admin/askai/export', { params, responseType: 'blob' });
    return resp.data as Blob;
};

// ─────────────────────────────────────────────────────────────────────
// MiMo 多模态视频分析
// ─────────────────────────────────────────────────────────────────────
export interface MimoVideoItem {
    path: string;
    name: string;
    size: number;
}

export interface MimoAnalyzeRequest {
    videos: MimoVideoItem[];
    compress_oversized: boolean;
    prompt?: string | null;
}

export interface MimoAnalyzeResponse {
    task_id: string;
    total_videos: number;
    compress_needed: number;
    status: string;
}

export interface MimoStatusResponse {
    task_id: string;
    status: string;
    total_videos: number;
    completed_videos: number;
    detail: Record<string, unknown> | null;
}

export const mimoAnalyze = async (req: MimoAnalyzeRequest): Promise<MimoAnalyzeResponse> => {
    const resp = await api.post('/mimo/analyze', req);
    return resp.data;
};

export const mimoGetStatus = async (taskId: string): Promise<MimoStatusResponse> => {
    const resp = await api.get(`/mimo/status/${taskId}`);
    return resp.data;
};

export const mimoGetResults = async (taskId: string): Promise<Record<string, unknown>> => {
    const resp = await api.get(`/mimo/results/${taskId}`);
    return resp.data;
};


// ---------------------------------------------------------------------------
// 报告板块（Reports）
// ---------------------------------------------------------------------------
export interface ReportFileMeta {
    path: string;
    exists: boolean;
    size_bytes: number;
    modified_at: string;
}

export interface ReportOutput {
    key: string;
    label: string;
    path: string;
    generated_by: string;
    description: string;
    meta: ReportFileMeta | null;
}

export interface ReportCatalogEntry {
    key: string;
    name: string;
    category: string;
    category_label: string;
    purpose: string;
    source_markdown: string;
    source_meta: ReportFileMeta | null;
    outputs: ReportOutput[];
}

export interface ReportGeneratorSyntax {
    feature: string;
    detail: string;
    location: string;
}

export interface ReportGeneratorThemeToken {
    name: string;
    value: string;
}

export interface ReportGenerator {
    script: string;
    engine: string;
    source_path_const: { value: string; location: string };
    output_path_const: { value: string; location: string };
    regenerate_enabled: boolean;
    regenerate_note: string;
    supported_syntax: ReportGeneratorSyntax[];
    theme: {
        title: string;
        location: string;
        tokens: ReportGeneratorThemeToken[];
        layout: string;
    };
    storage: string;
}

export interface BenchmarkReportDetail extends ReportCatalogEntry {
    generator: ReportGenerator;
    source_markdown_content: string | null;
    html_content: string | null;
    ppt_html_content: string | null;
}

export const getReports = async (): Promise<{ reports: ReportCatalogEntry[] }> => {
    const resp = await api.get('/reports');
    return resp.data;
};

export const getBenchmarkReport = async (): Promise<BenchmarkReportDetail> => {
    const resp = await api.get('/reports/benchmark');
    return resp.data;
};

export const getBenchmarkPreview = async (
    variant: 'html' | 'ppt' = 'html'
): Promise<{ variant: string; path: string; html_content: string }> => {
    const resp = await api.get('/reports/benchmark/preview', { params: { variant } });
    return resp.data;
};

// ---- 报告 SKILL 文档（两层：全局设计规范 + 对标报告框架，可编辑 Markdown）----
export type SkillKey = 'design-system' | 'benchmark-framework';

export interface SkillDoc {
    key: string;
    title: string;
    filename: string;
    content: string;
    size_bytes: number;
    modified_at: number;
}

export const getSkillDoc = async (key: SkillKey): Promise<SkillDoc> => {
    const resp = await api.get(`/reports/skills/${key}`);
    return resp.data;
};

export const saveSkillDoc = async (key: SkillKey, content: string): Promise<SkillDoc> => {
    const resp = await api.put(`/reports/skills/${key}`, { content });
    return resp.data;
};

// ---- 报告实例（选车型→生成→列表/预览/改名/删除）----
export interface ReportVehicle {
    brand_model: string;
    system_version: string | null;
    sample_count?: number | null;
    overall_score?: number | null;
}

export interface ReportInstance {
    id: string;
    name: string;
    own_vehicle: { brand_model: string; system_version: string | null };
    competitors: { brand_model: string; system_version: string | null }[];
    report_type?: 'benchmark' | 'ppt' | string;
    report_kind?: 'standard' | 'custom' | string;
    visibility?: 'private' | 'shared' | string;
    created_by?: number | null;
    can_manage?: boolean;
    status: 'processing' | 'completed' | 'failed' | string;
    error?: string | null;
    has_html: boolean;
    created_at: string;
}

export type ReportScope = 'mine' | 'shared' | 'all';

export const getReportVehicles = async (): Promise<{ vehicles: ReportVehicle[] }> => {
    const resp = await api.get('/reports/vehicles');
    return resp.data;
};

export const createReport = async (body: {
    name?: string;
    own_vehicle: { brand_model: string; system_version: string | null };
    competitors: { brand_model: string; system_version: string | null }[];
    report_type?: 'benchmark' | 'ppt';
    lang?: 'zh' | 'en';
    template_id?: string;
    template_pages?: number[];
    with_appendix?: boolean;
}): Promise<{ id: string; name: string; status: string; report_type?: string; lang?: string }> => {
    const resp = await api.post('/reports/instances', body);
    return resp.data;
};

// 报告生成进度（SSE 实时流）。pct=-1 表示失败；status 到 completed/failed 时流结束。
export interface ReportProgress {
    pct: number;
    msg: string;
    status: 'processing' | 'completed' | 'failed' | string;
    log: { pct: number; msg: string; ts: string }[];
}

// 用 fetch + ReadableStream 读 SSE（EventSource 不支持自定义 Authorization 头）。
// onEvent 每收到一条进度触发；done/error 后 resolve。
export const streamReportProgress = async (
    reportId: string,
    onEvent: (p: ReportProgress) => void,
    options?: { signal?: AbortSignal },
): Promise<void> => {
    const url = `${BASE_URL}/reports/instances/${reportId}/stream`;
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const resp = await fetch(url, { method: 'GET', headers, signal: options?.signal });
    if (resp.status === 401) {
        clearAuthToken();
        window.dispatchEvent(new CustomEvent('beeeval:unauthorized'));
        throw new Error('unauthorized');
    }
    if (!resp.ok || !resp.body) throw new Error(`progress stream failed: HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf('\n\n');
        while (sep !== -1) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = block.split('\n').find((l) => l.startsWith('data:'));
            if (line) {
                try {
                    const p = JSON.parse(line.slice(5).trim()) as ReportProgress;
                    onEvent(p);
                } catch { /* 忽略半包 */ }
            }
            sep = buffer.indexOf('\n\n');
        }
    }
};

// 一次性查进度（SSE 兜底）
export const getReportProgress = async (reportId: string): Promise<ReportProgress> => {
    const resp = await api.get(`/reports/instances/${reportId}/progress`);
    return resp.data;
};

export const listReportInstances = async (
    params?: { offset?: number; limit?: number; scope?: ReportScope }
): Promise<{ data: ReportInstance[]; total: number }> => {
    const resp = await api.get('/reports/instances', { params });
    return resp.data;
};

// 发布/取消发布为标准报告（全员可读）。仅 admin。
export const publishReport = async (id: string): Promise<{ id: string; visibility: string }> => {
    const resp = await api.post(`/reports/instances/${id}/publish`);
    return resp.data;
};

export const unpublishReport = async (id: string): Promise<{ id: string; visibility: string }> => {
    const resp = await api.post(`/reports/instances/${id}/unpublish`);
    return resp.data;
};

// 自定义构建器左侧可选页清单（标准报告的页面蓝图）
export interface ReportPageBlueprint {
    page: number;
    marker: string;
    title: string;
}

export const getPageBlueprints = async (): Promise<{ pages: ReportPageBlueprint[] }> => {
    const resp = await api.get('/reports/page-blueprints');
    return resp.data;
};

// ---- 自定义报告构建器 ----
export interface BuilderPage {
    index: number;
    marker: string;
    title: string;
    summary: string;
}

export interface ReportTemplate {
    id: string;
    name: string;
    pages: number[];
    created_by?: number | null;
    created_at?: string;
    updated_at?: string;
}

// 左侧可选页面（默认前 5 页示范；all=true 返回全部）
export const getBuilderPages = async (all = false): Promise<{ pages: BuilderPage[] }> => {
    const resp = await api.get('/reports/builder/pages', { params: { all } });
    return resp.data;
};

// 单页独立预览 HTML
export const getBuilderPagePreview = async (index: number): Promise<{ index: number; html_content: string }> => {
    const resp = await api.get(`/reports/builder/pages/${index}/preview`);
    return resp.data;
};

// 选定多页组装预览 HTML
export const previewBuilderPages = async (pages: number[]): Promise<{ pages: number[]; html_content: string }> => {
    const resp = await api.post('/reports/builder/preview', { pages });
    return resp.data;
};

export const listBuilderTemplates = async (): Promise<{ templates: ReportTemplate[] }> => {
    const resp = await api.get('/reports/builder/templates');
    return resp.data;
};

export const createBuilderTemplate = async (name: string, pages: number[]): Promise<ReportTemplate> => {
    const resp = await api.post('/reports/builder/templates', { name, pages });
    return resp.data;
};

export const updateBuilderTemplate = async (
    tplId: string, body: { name?: string; pages?: number[] }
): Promise<ReportTemplate> => {
    const resp = await api.put(`/reports/builder/templates/${tplId}`, body);
    return resp.data;
};

export const previewBuilderTemplate = async (tplId: string): Promise<{ id: string; pages: number[]; html_content: string }> => {
    const resp = await api.get(`/reports/builder/templates/${tplId}/preview`);
    return resp.data;
};

export const deleteBuilderTemplate = async (tplId: string): Promise<{ id: string; deleted: boolean }> => {
    const resp = await api.delete(`/reports/builder/templates/${tplId}`);
    return resp.data;
};

export const getReportInstance = async (id: string): Promise<ReportInstance> => {
    const resp = await api.get(`/reports/instances/${id}`);
    return resp.data;
};

export const getReportInstancePreview = async (id: string): Promise<{ id: string; html_content: string }> => {
    const resp = await api.get(`/reports/instances/${id}/preview`);
    return resp.data;
};

export const renameReportInstance = async (id: string, name: string): Promise<{ id: string; name: string }> => {
    const resp = await api.patch(`/reports/instances/${id}`, { name });
    return resp.data;
};

// 导出报告 PDF（与网页一致），浏览器触发下载
export const downloadReportPDF = async (id: string, name?: string): Promise<void> => {
    const resp = await api.get(`/reports/instances/${id}/pdf`, { responseType: 'blob' });
    const blob = new Blob([resp.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (name || 'report') + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

export const deleteReportInstance = async (id: string): Promise<{ id: string; deleted: boolean }> => {
    const resp = await api.delete(`/reports/instances/${id}`);
    return resp.data;
};

// 下载报告的单文件 HTML（后端已能返回全文，前端造 Blob 触发下载）
export const downloadReportHTML = async (id: string, name?: string): Promise<void> => {
    const { html_content } = await getReportInstancePreview(id);
    const blob = new Blob([html_content], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (name || 'report') + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

// ---- 报告配方（schema/prompts 可编辑，aggregation/template 只读）----
export type RecipeKind = 'schema' | 'prompts' | 'aggregation' | 'template';

export interface ReportConfig {
    kind: RecipeKind;
    editable: boolean;
    format: 'json' | 'markdown' | 'structure';
    content: string | { page: number; marker: string; title: string }[];
}

export const getReportConfig = async (kind: RecipeKind): Promise<ReportConfig> => {
    const resp = await api.get(`/reports/config/${kind}`);
    return resp.data;
};

export const saveReportConfig = async (kind: RecipeKind, content: string): Promise<{ kind: string; saved: boolean }> => {
    const resp = await api.put(`/reports/config/${kind}`, { content });
    return resp.data;
};




/** Local content-search adapter, backed exclusively by authorized live records. */
export const getCaseContentSearch = async (params: Parameters<typeof getAllResults>[0] & {group_by_case?: boolean}, requestOptions?: {signal?:AbortSignal}) => {
    const response=await api.get('/cases/search',{params,signal:requestOptions?.signal});
    return response.data as PaginatedResponse<any> & {total_cases?:number;status?:'indexing';scanned?:number;facets?:{task_types:string[];difficulties:string[]}};
};

/** Load filter vocabulary after the visible page; a facet scan must not block rows. */
export const getCaseSearchFacets = async (params: Parameters<typeof getAllResults>[0], signal?: AbortSignal) => {
    const response = await api.get('/cases/search', {params: {...params, facets_only: true}, signal});
    return response.data.facets as {task_types: string[]; difficulties: string[]};
};
