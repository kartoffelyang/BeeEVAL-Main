import { useEffect, useState } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { getAllResults } from "../api";
import { ResultDetailContent } from "../components/ResultDetailModal";
import VideoPlayerModal from "../components/VideoPlayerModal";
import {
  PlatformEmpty,
  PlatformSkeleton,
} from "../components/platform/PlatformUI";
import { useLanguage } from "../contexts/LanguageContext";
export default function EvidencePage() {
  const route = useLocation();
  const [params] = useSearchParams();
  const signature = params.toString();
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [video, setVideo] = useState<{ path: string; title: string } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);
    const id = params.get("case_id");
    const name = params.get("video_name");
    if (!id && !name) {
      setError(
        c(
          "链接缺少用例编号或视频名称，请返回查用例。",
          "This link requires a case ID or video name.",
        ),
      );
      setLoading(false);
      return;
    }
    getAllResults({
      case_id: id || undefined,
      video_name: name || undefined,
      brand_model: params.get("brand_model") || undefined,
      system_version: params.get("system_version") || undefined,
      limit: 100,
      exclude_review: true,
    })
      .then((r) => {
        if (cancelled) return;
        const target = params.get("record");
        const match = target
          ? r.data.find((x) => x.id === target)
          : r.data.length === 1
            ? r.data[0]
            : null;
        if (match) setResult(match);
        else
          setError(
            r.data.length > 1
              ? c(
                  "该用例对应多条记录，请返回查用例选择车型、版本及测试记录。",
                  "Multiple records match. Choose a model, version and record in case search.",
                )
              : c(
                  "未找到对应记录，或当前账号无权查看。",
                  "Record unavailable or access restricted.",
                ),
          );
      })
      .catch(() => {
        if (!cancelled)
          setError(
            c(
              "证据服务暂时不可用，请重试。",
              "Evidence service unavailable. Please retry.",
            ),
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signature, retry]);
  const query = new URLSearchParams(params);
  query.delete("record");
  return (
    <div className="pf-page evidence-page">
      <div className="evidence-page-toolbar">
        <Link to={route.state?.returnTo || `/?${query}`}>
          {c("← 返回用例列表", "← Case results")}
        </Link>
      </div>
      {loading ? (
        <PlatformSkeleton />
      ) : error ? (
        <PlatformEmpty
          error
          title={error}
          action={
            <button onClick={() => setRetry((x) => x + 1)}>
              {c("重新加载", "Retry")}
            </button>
          }
        />
      ) : (
        <section className="evidence-detail">
          <ResultDetailContent
            result={result}
            flow
            onPlayVideo={(path, title) => setVideo({ path, title })}
          />
        </section>
      )}
      <VideoPlayerModal
        open={!!video}
        videoPath={video?.path || null}
        title={video?.title || null}
        onClose={() => setVideo(null)}
      />
    </div>
  );
}
