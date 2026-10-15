import { useEffect, useState } from "react";
import { getTaskDetailCases } from "../../api";
import { ResultDetailContent } from "../../components/ResultDetailModal";
import VideoPlayerModal from "../../components/VideoPlayerModal";
import {
  PlatformDrawer,
  PlatformEmpty,
  PlatformSkeleton,
  PlatformAction,
} from "../../components/platform/PlatformUI";
import { useLanguage } from "../../contexts/LanguageContext";
interface Props {
  brandModel: string;
  systemVersion: string | null;
  functionDomain: string;
  taskDetail: string;
  vehicleLabel: string;
  acceptanceTag?: string;
  vehicleOptions?: Array<{
    brandModel: string;
    systemVersion: string | null;
    label: string;
  }>;
  onClose: () => void;
}
export default function TaskDetailCasesModal({
  brandModel,
  systemVersion,
  functionDomain,
  taskDetail,
  vehicleLabel,
  acceptanceTag,
  vehicleOptions,
  onClose,
}: Props) {
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(0);
  const [vehicleIndex, setVehicleIndex] = useState(0);
  const selectedVehicle = vehicleOptions?.[vehicleIndex] || {
    brandModel,
    systemVersion,
    label: vehicleLabel,
  };
  const [video, setVideo] = useState<{ path: string; title: string } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setRows([]);
    getTaskDetailCases(
      selectedVehicle.brandModel,
      functionDomain,
      taskDetail,
      selectedVehicle.systemVersion,
      acceptanceTag,
    )
      .then((r) => {
        if (!cancelled) {
          setRows(r.data || []);
          setActive(0);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedVehicle.brandModel,
    selectedVehicle.systemVersion,
    functionDomain,
    taskDetail,
    acceptanceTag,
    retry,
  ]);
  const result = rows[active];
  return (
    <>
      {!video && (
        <PlatformDrawer
          centered
          title={taskDetail}
          eyebrow={`${selectedVehicle.label} · ${functionDomain}${acceptanceTag ? ` · ${acceptanceTag}` : ""}`}
          onClose={onClose}
        >
          {!!vehicleOptions?.length && (
            <nav
              className="task-video-vehicles"
              aria-label={c("选择车型视频", "Choose model videos")}
            >
              {vehicleOptions.map((v, i) => (
                <button
                  key={`${v.brandModel}||${v.systemVersion}`}
                  aria-pressed={vehicleIndex === i}
                  onClick={() => {
                    setVehicleIndex(i);
                    setActive(0);
                  }}
                >
                  {v.label}
                </button>
              ))}
            </nav>
          )}
          {loading ? (
            <PlatformSkeleton />
          ) : error ? (
            <PlatformEmpty
              error
              title={c("用例暂时无法读取", "Unable to load cases")}
              action={
                <PlatformAction onClick={() => setRetry((x) => x + 1)}>
                  {c("重试", "Retry")}
                </PlatformAction>
              }
            />
          ) : !result ? (
            <PlatformEmpty
              title={c("该任务暂无用例", "No records for this task")}
            />
          ) : (
            <>
              <div className="task-video-layout">
                <nav
                  className="task-video-menu"
                  aria-label={c("视频卡片", "Video cards")}
                >
                  <p>
                    {c(
                      `${rows.length} 条视频记录`,
                      `${rows.length} video records`,
                    )}
                  </p>
                  {rows.map((r, i) => (
                    <button
                      key={r.id || i}
                      aria-pressed={active === i}
                      onClick={() => setActive(i)}
                    >
                      <strong>
                        {r.case_id ||
                          r.video_name ||
                          c(`视频 ${i + 1}`, `Video ${i + 1}`)}
                      </strong>
                      <span>
                        {r.metadata?.user_question ||
                          r.user_question ||
                          r.video_name}
                      </span>
                      <small>
                        {c("得分", "Score")}{" "}
                        {r.metadata?.response_quality_score ?? "—"} / 5
                      </small>
                    </button>
                  ))}
                </nav>
                <div className="task-video-content">
                  <ResultDetailContent
                    key={result.id || active}
                    result={result}
                    flow
                    onPlayVideo={(path, title) => setVideo({ path, title })}
                  />
                </div>
              </div>
            </>
          )}
        </PlatformDrawer>
      )}
      <VideoPlayerModal
        open={!!video}
        videoPath={video?.path || null}
        title={video?.title || null}
        onClose={() => setVideo(null)}
      />
    </>
  );
}
