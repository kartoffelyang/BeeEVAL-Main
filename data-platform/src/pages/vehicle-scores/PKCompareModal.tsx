import { useEffect, useState } from "react";
import { getPKDetail } from "../../api";
import { parseVehicleKey } from "./ComparisonContext";
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
  caseId: string;
  baseKey: string;
  compareKey: string;
  getLabel: (key: string) => string;
  onClose: () => void;
}
export default function PKCompareModal({
  caseId,
  baseKey,
  compareKey,
  getLabel,
  onClose,
}: Props) {
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ a: any; b: any } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [video, setVideo] = useState<{ path: string; title: string } | null>(
    null,
  );
  const isCompare = baseKey !== compareKey;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);
    const a = parseVehicleKey(baseKey),
      b = parseVehicleKey(compareKey);
    getPKDetail({
      case_id: caseId,
      brand_model_a: a.brand_model,
      brand_model_b: b.brand_model,
      system_version_a: a.system_version || undefined,
      system_version_b: b.system_version || undefined,
    })
      .then((r) => {
        if (!cancelled) setData(r);
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
  }, [caseId, baseKey, compareKey, retry]);
  const sides = isCompare
    ? [
        { result: data?.a, key: baseKey },
        { result: data?.b, key: compareKey },
      ]
    : [{ result: data?.a, key: baseKey }];
  return (
    <>
      {!video && (
        <PlatformDrawer
          centered
          title={`${c("用例", "Case")} ${caseId} · ${isCompare ? c("两车证据对比", "Compare evidence") : c("测试证据", "Evidence")}`}
          onClose={onClose}
        >
          {loading ? (
            <PlatformSkeleton />
          ) : error ? (
            <PlatformEmpty
              error
              title={c("证据暂时无法读取", "Unable to load evidence")}
              action={
                <PlatformAction onClick={() => setRetry((x) => x + 1)}>
                  {c("重试", "Retry")}
                </PlatformAction>
              }
            />
          ) : (
            <div className={isCompare ? "pk-evidence-pair" : ""}>
              {sides.map(({ result, key }) => (
                <section key={key}>
                  <h3 className="p-4 font-semibold">{getLabel(key)}</h3>
                  {result ? (
                    <>
                      <ResultDetailContent
                        result={result}
                        flow
                        onPlayVideo={(path, title) => setVideo({ path, title })}
                      />
                    </>
                  ) : (
                    <PlatformEmpty
                      title={c(
                        "该车型 / 版本没有此用例记录",
                        "No record for this model / version",
                      )}
                    />
                  )}
                </section>
              ))}
            </div>
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
