import React from "react";
import { X, Star } from "lucide-react";
import { useComparison, vehicleKey } from "./ComparisonContext";
import { useLanguage } from "../../contexts/LanguageContext";
import TrialMoreHint from "../../components/TrialMoreHint";
import LightSelect from "../../components/LightSelect";
const VehicleSelector: React.FC<{ maxCompetitors?: number }> = ({
  maxCompetitors = 4,
}) => {
  const { t, language } = useLanguage();
  const {
    vehicles,
    primaryKey,
    competitorKeys,
    setPrimaryKey,
    addCompetitor,
    removeCompetitor,
    getColor,
    getVehicleLabel,
    fetchSnapshot,
  } = useComparison();

  const allSelected = new Set([primaryKey, ...competitorKeys]);
  const available = vehicles.filter((v) => !allSelected.has(vehicleKey(v)));
  const evalBadge = (key: string) => vehicles.find((v) => vehicleKey(v) === key)?.eval_version || null;
  const handleSelect = (key: string) => {
    if (!key) return;
    if (!primaryKey) setPrimaryKey(key);
    else addCompetitor(key);
    void fetchSnapshot(key);
  };

  const handleRemove = (key: string) => {
    if (key === primaryKey) {
      if (competitorKeys.length > 0) {
        setPrimaryKey(competitorKeys[0]);
        removeCompetitor(competitorKeys[0]);
      } else {
        setPrimaryKey(null);
      }
    } else {
      removeCompetitor(key);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 本品 Chip */}
      {primaryKey && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-text-inverse"
          style={{ backgroundColor: getColor(primaryKey) }}
        >
          <Star className="w-3.5 h-3.5" />
          <span>{getVehicleLabel(primaryKey)}</span>
          {evalBadge(primaryKey) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 font-semibold">
              {evalBadge(primaryKey)}
            </span>
          )}
          <button
            aria-label={`${language === "zh" ? "移除" : "Remove"} ${getVehicleLabel(primaryKey)}`}
            onClick={() => handleRemove(primaryKey)}
            className="ml-1 hover:opacity-70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 竞品 Chips */}
      {competitorKeys.map((key) => (
        <div
          key={key}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-text-inverse"
          style={{ backgroundColor: getColor(key) }}
        >
          <span>{getVehicleLabel(key)}</span>
          {evalBadge(key) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 font-semibold">
              {evalBadge(key)}
            </span>
          )}
          <button
            aria-label={`${language === "zh" ? "移除" : "Remove"} ${getVehicleLabel(key)}`}
            onClick={() => handleRemove(key)}
            className="ml-1 hover:opacity-70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* 添加按钮 + 下拉：竞品数达上限（或还没选本品时也允许先选本品）后隐藏 */}
      {(competitorKeys.length < maxCompetitors || !primaryKey) && (
        <div className="vehicle-add-select">
          <LightSelect
            value=""
            onChange={(e) => handleSelect(e.target.value)}
            aria-label={
              primaryKey
                ? t("add_competitor")
                : language === "zh"
                  ? "选择本品车型与版本"
                  : "Choose your model / version"
            }
          >
            <option value="" disabled>
              {primaryKey
                ? t("add_competitor")
                : language === "zh"
                  ? "选择本品车型与版本"
                  : "Choose your model / version"}
            </option>
            {available.map((v) => (
              <option key={vehicleKey(v)} value={vehicleKey(v)}>
                {getVehicleLabel(vehicleKey(v))}{v.eval_version ? ` (${v.eval_version})` : ""}
              </option>
            ))}
          </LightSelect>
        </div>
      )}
    </div>
  );
};

export default VehicleSelector;
