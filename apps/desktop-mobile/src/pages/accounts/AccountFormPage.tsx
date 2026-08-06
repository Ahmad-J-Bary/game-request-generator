// src/pages/accounts/AccountFormPage.tsx

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronLeft, ChevronRight, Clock, RefreshCw } from 'lucide-react';
import { useAccounts } from '@grq/core/hooks/useAccounts';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Label } from '@grq/ui/atoms/label';
import { Textarea } from '@grq/ui/atoms/textarea';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { Popover, PopoverContent, PopoverTrigger } from '@grq/ui/atoms/popover';
import { BackButton } from '@grq/ui/molecules/BackButton';
import { CreateAccountRequest, UpdateAccountRequest, GameBranch, AccountBranchTransferResult, Region, Account } from '@grq/api-bindings';
import { NotificationService } from '@grq/core/utils/notifications';
import { TauriService } from '@grq/core/services/tauri.service';
import { useGames } from '@grq/core/hooks/useGames';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@grq/ui/atoms/select';
import { BranchTransferDialog } from '@grq/ui/organisms/BranchTransferDialog';

// Simple Calendar Component
const SimpleCalendar = ({
  selectedDate,
  onDateSelect,
  onClose
}: {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());

  const monthNames = [
    t('common.months.january'), t('common.months.february'), t('common.months.march'), t('common.months.april'),
    t('common.months.may'), t('common.months.june'), t('common.months.july'), t('common.months.august'),
    t('common.months.september'), t('common.months.october'), t('common.months.november'), t('common.months.december')
  ];

  const dayNames = [
    t('common.days.su'), t('common.days.mo'), t('common.days.tu'), t('common.days.we'),
    t('common.days.th'), t('common.days.fr'), t('common.days.sa')
  ];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const handleDateClick = (date: Date) => {
    onDateSelect(date);
    onClose();
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(prev.getMonth() - 1);
      } else {
        newMonth.setMonth(prev.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const days = getDaysInMonth(currentMonth);

  return (
    <div className="p-3 bg-popover border rounded-lg shadow-lg w-64">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateMonth('prev')}
          className="h-6 w-6 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="font-semibold text-sm">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateMonth('next')}
          className="h-6 w-6 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map(day => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => (
          <div key={index} className="text-center">
            {date ? (
              <Button
                variant={
                  selectedDate &&
                    date.toDateString() === selectedDate.toDateString()
                    ? "default"
                    : "ghost"
                }
                size="sm"
                onClick={() => handleDateClick(date)}
                className="h-8 w-8 p-0 text-xs hover:bg-accent"
              >
                {date.getDate()}
              </Button>
            ) : (
              <div className="h-8 w-8"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple Time Picker Component
const SimpleTimePicker = ({
  selectedTime,
  onTimeSelect,
  onClose
}: {
  selectedTime: string;
  onTimeSelect: (time: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  // Parse current time (handles HH:mm, HH:mm:ss, and hh:mm AM/PM)
  const parseTime = (timeStr: string) => {
    if (!timeStr) return { hour: 12, minute: 0, ampm: 'PM' };

    // Check if it's AM/PM format
    const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (ampmMatch) {
      return {
        hour: parseInt(ampmMatch[1], 10),
        minute: parseInt(ampmMatch[2], 10),
        ampm: ampmMatch[3].toUpperCase()
      };
    }

    // Fallback to 24h format
    const [h, m] = timeStr.split(':').map(Number);
    let hour = h || 0;
    let ampm = 'AM';

    if (hour >= 12) {
      ampm = 'PM';
      if (hour > 12) hour -= 12;
    } else if (hour === 0) {
      hour = 12;
    }

    return { hour, minute: m || 0, ampm };
  };

  const currentTime = parseTime(selectedTime);
  const [hour, setHour] = useState(currentTime.hour);
  const [minute, setMinute] = useState(currentTime.minute);
  const [ampm, setAmpm] = useState(currentTime.ampm);

  const handleTimeSelect = () => {
    const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
    onTimeSelect(formattedTime);
    onClose();
  };

  const generateOptions = (start: number, end: number) => {
    const options = [];
    for (let i = start; i <= end; i++) {
      options.push(i);
    }
    return options;
  };

  return (
    <div className="p-4 bg-popover border rounded-lg shadow-lg w-72">
      <div className="text-center mb-4">
        <div className="text-2xl font-mono font-bold">
          {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')} {ampm}
        </div>
        <div className="text-sm text-muted-foreground">{t('accounts.selectedTime')}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {/* Hour Selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Hour</Label>
          <div className="max-h-32 overflow-y-auto border rounded p-2">
            <div className="grid grid-cols-2 gap-1">
              {generateOptions(1, 12).map((h) => (
                <Button
                  key={h}
                  variant={h === hour ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setHour(h)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  {h}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Minute Selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Minute</Label>
          <div className="max-h-32 overflow-y-auto border rounded p-2">
            <div className="grid grid-cols-2 gap-1">
              {generateOptions(0, 59).map((m) => (
                <Button
                  key={m}
                  variant={m === minute ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMinute(m)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  {String(m).padStart(2, '0')}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* AM/PM Selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">AM/PM</Label>
          <div className="flex flex-col gap-2">
            {['AM', 'PM'].map((p) => (
              <Button
                key={p}
                variant={p === ampm ? "default" : "ghost"}
                size="sm"
                onClick={() => setAmpm(p)}
                className="h-10 w-full text-xs"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Common Time Presets */}
      <div className="mb-4">
        <Label className="text-sm font-medium mb-2 block">Quick Select</Label>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: '12:00 AM', h: 12, m: 0, p: 'AM' },
            { label: '06:00 AM', h: 6, m: 0, p: 'AM' },
            { label: '12:00 PM', h: 12, m: 0, p: 'PM' },
            { label: '06:00 PM', h: 6, m: 0, p: 'PM' },
          ].map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => {
                setHour(preset.h);
                setMinute(preset.m);
                setAmpm(preset.p);
              }}
              className="text-[10px] h-8 px-1"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleTimeSelect}>
          Select Time
        </Button>
      </div>
    </div>
  );
};

export default function AccountFormPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const gameId = searchParams.get('gameId') ? parseInt(searchParams.get('gameId')!, 10) : undefined;
  const [initialBranchId] = useState<number | undefined>(
    searchParams.get('branchId') ? parseInt(searchParams.get('branchId')!, 10) : undefined,
  );
  const { accounts, addAccount, updateAccount } = useAccounts();

  const locationState = location.state as { account?: import('@grq/api-bindings').Account; selectedGameId?: number } | null;
  const stateAccount = locationState?.account;
  const selectedGameId = locationState?.selectedGameId;
  const isEditMode = location.pathname.includes('/edit/');
  const accountId = id ? parseInt(id, 10) : undefined;
  const account = isEditMode && accountId ? (stateAccount || accounts.find(a => a.id === accountId)) : undefined;
  const isRtl = i18n.dir() === 'rtl';

  const getDefaultStartDate = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const getDefaultStartTime = () => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date()).toUpperCase();
  };

  const [name, setName] = useState(account?.name || '');
  const [startDate, setStartDate] = useState<Date | null>(
    account?.start_date ? new Date(account.start_date) : (isEditMode ? null : getDefaultStartDate())
  );
  const [startTime, setStartTime] = useState(account?.start_time || (isEditMode ? '' : getDefaultStartTime()));
  const [requestTemplate, setRequestTemplate] = useState(account?.request_template || '');
  const [loading, setLoading] = useState(false);

  // Region selection (country = primary region, sub-region = the target state)
  const [regions, setRegions] = useState<Region[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<number | null>(null);
  const [suggestedSub, setSuggestedSub] = useState('');
  const [selectedSub, setSelectedSub] = useState('');

  // Mirror the backend create_account auto-assignment so the sub-region
  // selector can show the rotating region for the next account of a game.
  const computeSuggestedSubRegion = (gameId: number): string => {
    const subRegionNames = [...regions]
      .filter((r) => r.parent_id != null)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((r) => r.name);
    const subRegions = subRegionNames.length > 0
      ? subRegionNames
      : ['FLORIDA', 'CALIFORNIA', 'TEXAS', 'New York'];

    // 1. Reuse a package that doesn't have this game yet (batch completion).
    const gamePackages = new Set(
      allAccounts.filter((a) => a.game_id === gameId).map((a) => a.package_id)
    );
    const availablePackage = allAccounts
      .filter((a) => a.package_id != null && !gamePackages.has(a.package_id) && a.proxy_state !== 'UK')
      .sort((a, b) => (a.package_id ?? 0) - (b.package_id ?? 0))[0];
    if (availablePackage?.proxy_state) {
      return availablePackage.proxy_state;
    }

    // 2. New package round-robin, skipping states used today for this game.
    const maxPackageId = allAccounts.reduce(
      (max, a) => Math.max(max, a.package_id ?? 0),
      0
    );
    const nextId = maxPackageId + 1;
    const today = new Date().toISOString().slice(0, 10);
    const usedToday = new Set(
      allAccounts
        .filter((a) => a.game_id === gameId && a.created_at?.slice(0, 10) === today)
        .map((a) => a.proxy_state)
        .filter(Boolean)
    );
    let chosen = subRegions[(nextId - 1) % subRegions.length];
    if (usedToday.has(chosen)) {
      const firstUnused = subRegions.find((s) => !usedToday.has(s));
      if (firstUnused) chosen = firstUnused;
    }
    return chosen;
  };

  useEffect(() => {
    let active = true;
    Promise.all([TauriService.getRegions(), TauriService.getAllAccounts()])
      .then(([regs, accs]) => {
        if (!active) return;
        setRegions(regs || []);
        setAllAccounts(accs || []);
        const prims = [...(regs || [])]
          .filter((r) => r.is_primary)
          .sort((a, b) => a.sort_order - b.sort_order);
        const match = account?.proxy_state
          ? (regs || []).find((r) => r.name === account.proxy_state && r.parent_id != null)
          : undefined;
        const defaultPrimary = match
          ? prims.find((p) => p.id === match.parent_id)
          : prims[0];
        setSelectedPrimaryId(defaultPrimary?.id ?? prims[0]?.id ?? null);
        // In edit mode the account's own state wins; otherwise the sub-region
        // is left as Auto so the backend rotates the region on create.
        setSelectedSub(match?.name || '');
      })
      .catch((err) => console.error('Failed to load regions:', err));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentGameId = account ? account.game_id : gameId;

  // Recompute the rotating sub-region suggestion when the game or data changes.
  useEffect(() => {
    if (currentGameId) {
      setSuggestedSub(computeSuggestedSubRegion(currentGameId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameId, allAccounts, regions]);

  // Keep the region selection in sync when editing by id (account loads async)
  useEffect(() => {
    if (!account || regions.length === 0) return;
    const match = regions.find((r) => r.name === account.proxy_state && r.parent_id != null);
    if (match) {
      setSelectedPrimaryId(match.parent_id);
      setSelectedSub(match.name);
    }
  }, [account, regions]);

  const primaries = [...regions]
    .filter((r) => r.is_primary)
    .sort((a, b) => a.sort_order - b.sort_order);
  const selectedPrimary = primaries.find((p) => p.id === selectedPrimaryId) || primaries[0] || null;
  const subRegions = [...regions]
    .filter((r) => r.parent_id === selectedPrimary?.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  
  const { fetchBranches } = useGames();
  const [branches, setBranches] = useState<GameBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(account?.branch_id || null);
  const originalBranchIdRef = useRef<number | null>(account?.branch_id ?? null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [pendingBranchId, setPendingBranchId] = useState<number | null>(null);

  // Keep originalBranchIdRef in sync with account data
  useEffect(() => {
    if (account) {
      originalBranchIdRef.current = account.branch_id ?? null;
    }
  }, [account]);

  // Fetch branches when game changed
  useEffect(() => {
    if (currentGameId) {
      const loadBranches = async () => {
        const data = await fetchBranches(currentGameId);
        setBranches(data);
        
        if (data.length === 1) {
            setSelectedBranchId(data[0].id);
            return;
        }

        if (initialBranchId && data.some(b => b.id === initialBranchId)) {
            setSelectedBranchId(initialBranchId);
            return;
        }

        if (selectedBranchId !== null) return;

        const latestCreatedBranch = [...data]
          .filter(branch => !branch.is_default)
          .sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

            if (aTime !== bTime) {
              return bTime - aTime;
            }

            return b.id - a.id;
          })[0];

        const defaultBranch = data.find(b => b.is_default) || data[0];
        const preferredBranch = latestCreatedBranch || defaultBranch;

        if (preferredBranch) {
            setSelectedBranchId(preferredBranch.id);
        }
      };
      loadBranches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameId, fetchBranches, initialBranchId]); 

  // Format date for display
  const formatDateForDisplay = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date for API submission
  const formatDateForAPI = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    if (account) {
      setName(account.name);
      setStartDate(account.start_date ? new Date(account.start_date) : null);
      setStartTime(account.start_time);
      setRequestTemplate(account.request_template);
    }
  }, [account]);

  useEffect(() => {
    if (!account && accountId) {
      const foundAccount = accounts.find(a => a.id === accountId);
      if (foundAccount) {
        setName(foundAccount.name);
        setStartDate(foundAccount.start_date ? new Date(foundAccount.start_date) : null);
        setStartTime(foundAccount.start_time);
        setRequestTemplate(foundAccount.request_template);
      }
    }
  }, [accountId, account, accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentGameId = account ? account.game_id : gameId;
    if (!currentGameId || !name.trim() || !startDate || !startTime.trim() || !requestTemplate.trim()) {
      NotificationService.error(t('errors.required'));
      return;
    }

    setLoading(true);
    try {
      if (account) {
        const request: UpdateAccountRequest = {
          id: account.id,
          branch_id: selectedBranchId,
          name,
          start_date: formatDateForAPI(startDate),
          start_time: startTime,
          request_template: requestTemplate,
          proxy_state: selectedSub || undefined,
        };
        await updateAccount(request);
      } else {
        const request: CreateAccountRequest = {
          game_id: currentGameId,
          branch_id: selectedBranchId,
          name,
          start_date: formatDateForAPI(startDate),
          start_time: startTime,
          request_template: requestTemplate,
          proxy_state: selectedSub || undefined,
        };
        await addAccount(request);
      }
      window.dispatchEvent(new CustomEvent('data-changed'));
      window.dispatchEvent(new CustomEvent('account-updated', { detail: { accountId: account?.id } }));
      // Navigate back to accounts list with selected game preserved
      if (selectedGameId) {
        navigate(`/accounts/detail?gameId=${selectedGameId}`);
      } else {
        navigate(-1);
      }
    } catch (error) {
      console.error('Failed to save account:', error);
      NotificationService.error(t('errors.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton variant="ghost" size="sm" className="h-9">
            <ChevronLeft className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
            <span className="hidden xs:inline">{t('common.back')}</span>
        </BackButton>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {account ? t('accounts.editAccount') : t('accounts.addAccount')}
        </h1>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('accounts.accountName')}</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('accounts.accountNamePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('branches.branch')}</Label>
              <Select
                key={branches.length > 0 ? 'loaded' : 'empty'}
                value={selectedBranchId?.toString() || ""} 
                onValueChange={(val) => {
                  const newId = val === "" ? null : parseInt(val, 10);
                  if (isEditMode && account && newId !== originalBranchIdRef.current) {
                    setPendingBranchId(newId);
                    setShowTransferDialog(true);
                  } else {
                    setSelectedBranchId(newId);
                  }
                }}
              >
                <SelectTrigger
                  dir={i18n.dir()}
                  className={isRtl ? "text-right [&>span]:text-right" : "text-left [&>span]:text-left"}
                >
                    <SelectValue placeholder={t('branches.selectBranch')} />
                </SelectTrigger>
                <SelectContent dir={i18n.dir()}>
                    {branches.map(b => (
                        <SelectItem
                          key={b.id}
                          value={b.id.toString()}
                          className={isRtl ? "text-right" : "text-left"}
                        >
                            {b.name} {b.is_default && `(${t('common.default')})`}
                        </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {primaries.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {primaries.length > 1 && (
                  <div className="space-y-2">
                    <Label>{t('accounts.country', 'Country')}</Label>
                    <Select
                      value={selectedPrimary?.id?.toString() ?? ''}
                      onValueChange={(val) => {
                        const pid = parseInt(val, 10);
                        setSelectedPrimaryId(pid);
                        // Reset to Auto so the backend rotates the region
                        // for the next account of this game.
                        setSelectedSub('');
                      }}
                    >
                      <SelectTrigger
                        dir={i18n.dir()}
                        className={isRtl ? "text-right [&>span]:text-right" : "text-left [&>span]:text-left"}
                      >
                        <SelectValue placeholder={t('accounts.selectCountry', 'Select country')} />
                      </SelectTrigger>
                      <SelectContent dir={i18n.dir()}>
                        {primaries.map((p) => (
                          <SelectItem
                            key={p.id}
                            value={p.id.toString()}
                            className={isRtl ? "text-right" : "text-left"}
                          >
                            {p.emoji ? `${p.emoji} ` : ''}{p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className={`space-y-2 ${primaries.length > 1 ? '' : 'md:col-span-2'}`}>
                  <Label>{t('accounts.subRegion', 'Sub-region')}</Label>
                  <Select
                    value={selectedSub || suggestedSub}
                    onValueChange={(val) => {
                      if (val === 'auto') {
                        setSelectedSub('');
                      } else {
                        setSelectedSub(val);
                      }
                    }}
                  >
                    <SelectTrigger
                      dir={i18n.dir()}
                      className={isRtl ? "text-right [&>span]:text-right" : "text-left [&>span]:text-left"}
                    >
                      <SelectValue placeholder={t('accounts.selectSubRegion', 'Select sub-region')} />
                    </SelectTrigger>
                    <SelectContent dir={i18n.dir()}>
                      <SelectItem
                        value="auto"
                        className={isRtl ? "text-right" : "text-left"}
                      >
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="h-3 w-3" /> {t('accounts.autoRegion', 'Auto')}
                        </span>
                      </SelectItem>
                      {suggestedSub && !subRegions.some((s) => s.name === suggestedSub) && (
                        <SelectItem
                          value={suggestedSub}
                          className={isRtl ? "text-right" : "text-left"}
                        >
                          {suggestedSub}
                        </SelectItem>
                      )}
                      {subRegions.map((s) => (
                        <SelectItem
                          key={s.id}
                          value={s.name}
                          className={isRtl ? "text-right" : "text-left"}
                        >
                          {s.emoji ? `${s.emoji} ` : ''}{s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t('accounts.startDate')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="ltr:mr-2 rtl:ml-2 h-4 w-4" />
                      {startDate ? formatDateForDisplay(startDate) : t('accounts.pickDate')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <SimpleCalendar
                      selectedDate={startDate}
                      onDateSelect={setStartDate}
                      onClose={() => { }} // Popover handles closing
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startTime">{t('accounts.startTime')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Clock className="ltr:mr-2 rtl:ml-2 h-4 w-4" />
                      {startTime || t('accounts.pickTime')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <SimpleTimePicker
                      selectedTime={startTime}
                      onTimeSelect={setStartTime}
                      onClose={() => { }} // Popover handles closing
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">{t('accounts.requestTemplate')}</Label>
              <Textarea
                id="template"
                value={requestTemplate}
                onChange={e => setRequestTemplate(e.target.value)}
                placeholder={t('accounts.requestTemplatePlaceholder')}
                rows={10}
                className="font-mono text-xs"
                required
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? t('common.loading') : t('common.save')}
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                if (selectedGameId) {
                  navigate(`/accounts/detail?gameId=${selectedGameId}`);
                } else {
                  navigate(-1);
                }
              }}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {account && (
        <BranchTransferDialog
          open={showTransferDialog}
          onOpenChange={(open) => {
            if (!open) setShowTransferDialog(false);
          }}
          accountId={account.id}
          accountName={account.name}
          currentBranchId={originalBranchIdRef.current}
          currentBranchName={branches.find(b => b.id === originalBranchIdRef.current)?.name ?? null}
          gameId={account.game_id}
          defaultTargetBranchId={pendingBranchId ?? undefined}
          onTransferComplete={(result: AccountBranchTransferResult) => {
            setSelectedBranchId(result.targetBranchId);
            originalBranchIdRef.current = result.targetBranchId;
            setShowTransferDialog(false);
          }}
          onCancel={() => {
            setSelectedBranchId(originalBranchIdRef.current);
            setShowTransferDialog(false);
          }}
        />
      )}
    </div>
  );
}
