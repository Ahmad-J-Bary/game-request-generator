// src/pages/accounts/AccountFormPage.tsx

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useAccounts } from '../../hooks/useAccounts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { BackButton } from '../../components/molecules/BackButton';
import { CreateAccountRequest, UpdateAccountRequest } from '../../types';
import { NotificationService } from '../../utils/notifications';

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
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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
        <div className="text-sm text-muted-foreground">Selected Time</div>
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const gameId = searchParams.get('gameId') ? parseInt(searchParams.get('gameId')!, 10) : undefined;
  const { accounts, addAccount, updateAccount } = useAccounts();

  const stateAccount = (location.state as any)?.account;
  const isEditMode = location.pathname.includes('/edit/');
  const accountId = id ? parseInt(id, 10) : undefined;
  const account = isEditMode && accountId ? (stateAccount || accounts.find(a => a.id === accountId)) : undefined;

  const [name, setName] = useState(account?.name || '');
  const [startDate, setStartDate] = useState<Date | null>(account?.start_date ? new Date(account.start_date) : null);
  const [startTime, setStartTime] = useState(account?.start_time || '');
  const [requestTemplate, setRequestTemplate] = useState(account?.request_template || '');
  const [loading, setLoading] = useState(false);

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
      NotificationService.error("All fields are required");
      return;
    }

    setLoading(true);
    try {
      if (account) {
        const request: UpdateAccountRequest = {
          id: account.id,
          name,
          start_date: formatDateForAPI(startDate),
          start_time: startTime,
          request_template: requestTemplate,
        };
        await updateAccount(request);
      } else {
        const request: CreateAccountRequest = {
          game_id: currentGameId,
          name,
          start_date: formatDateForAPI(startDate),
          start_time: startTime,
          request_template: requestTemplate,
        };
        await addAccount(request);
      }
      navigate('/accounts');
    } catch (error) {
      console.error('Failed to save account:', error);
      NotificationService.error("An error occurred while saving the account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackButton />

      <Card>
        <CardHeader>
          <CardTitle>
            {account ? t('accounts.editAccount') : t('accounts.addAccount')}
          </CardTitle>
        </CardHeader>
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

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t('accounts.startDate')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {startDate ? formatDateForDisplay(startDate) : "Pick a date"}
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
                      <Clock className="mr-2 h-4 w-4" />
                      {startTime || "Pick a time"}
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
              <Button type="button" variant="outline" onClick={() => navigate('/accounts')}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
