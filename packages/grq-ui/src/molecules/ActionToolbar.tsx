import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@grq/ui/atoms/button";
import { Label } from "@grq/ui/atoms/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@grq/ui/atoms/popover";
import {
  Edit3,
  Save,
  X,
  Upload,
  Download,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";

type Mode = "event-only" | "all";

interface ActionToolbarProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  isEditMode: boolean;
  onEditToggle: () => void;
  onSave: () => void;
  onCancel: () => void;
  onImport: () => void;
  onExport: () => void;
  isExporting?: boolean;
  isSaving?: boolean;
  backTo?: string;
  editModeExtra?: ReactNode;
  exportDropdown?: ReactNode;
  mobilePopoverExtra?: ReactNode;
}

export function ActionToolbar({
  mode,
  onModeChange,
  isEditMode,
  onEditToggle,
  onSave,
  onCancel,
  onImport,
  onExport,
  isExporting,
  isSaving,
  backTo,
  editModeExtra,
  exportDropdown,
  mobilePopoverExtra,
}: ActionToolbarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const segActive = (active: boolean) =>
    `flex-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
      active
        ? "bg-background text-primary shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`;

  const modeSegments = (
    <div className="flex items-center gap-1 p-1 border rounded-lg bg-accent/30 shadow-inner">
      <button
        onClick={() => onModeChange("event-only")}
        className={segActive(mode === "event-only")}
      >
        {t("common.eventOnly")}
      </button>
      <button
        onClick={() => onModeChange("all")}
        className={segActive(mode === "all")}
      >
        {t("common.all")}
      </button>
    </div>
  );

  return (
    <>
      {isEditMode ? (
        <div className="flex items-center gap-2">
          {editModeExtra}
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-2 h-9 shrink-0 shadow-lg shadow-primary/20"
          >
            <Save className="h-4 w-4" />
            <span className="hidden xs:inline">{t("common.save")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="flex items-center gap-2 h-9 shrink-0"
          >
            <X className="h-4 w-4" />
            <span className="hidden xs:inline">{t("common.cancel")}</span>
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onEditToggle}
          className="flex items-center gap-2 h-9 group transition-all hover:border-primary/50"
        >
          <Edit3 className="h-4 w-4 transition-transform group-hover:rotate-12" />
          <span className="hidden xs:inline">{t("common.edit")}</span>
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onImport}
        className="flex items-center gap-2 h-9 shrink-0"
        title={t("common.import")}
      >
        <Upload className="h-4 w-4" />
        <span className="hidden sm:inline">{t("common.import")}</span>
      </Button>

      {exportDropdown ? exportDropdown : (
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={isExporting}
          className="flex items-center gap-2 h-9 shrink-0"
          title={t("common.export")}
        >
          {isExporting ? (
            <span className="animate-spin">...</span>
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{t("common.export")}</span>
        </Button>
      )}

      <div className="hidden lg:flex items-center gap-1 p-1 border rounded-lg h-9 bg-accent/30 shadow-inner">
        <button
          onClick={() => onModeChange("event-only")}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === "event-only" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t("common.eventOnly")}
        </button>
        <button
          onClick={() => onModeChange("all")}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === "all" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t("common.all")}
        </button>
      </div>

      <div className="lg:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 w-9 p-0 rounded-full">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-4" align="end">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase text-muted-foreground font-bold">
                {t("common.view")}
              </Label>
              {modeSegments}
            </div>
            {mobilePopoverExtra}
          </PopoverContent>
        </Popover>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (backTo) {
            navigate(backTo);
          } else {
            navigate(-1);
          }
        }}
        className="flex items-center gap-2 h-9 shrink-0"
        title={t("common.back")}
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden xs:inline">{t("common.back")}</span>
      </Button>
    </>
  );
}
