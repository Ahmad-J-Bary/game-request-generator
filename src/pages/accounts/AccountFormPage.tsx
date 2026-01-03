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
  // Parse current time
  const parseTime = (timeStr: string) => {
    if (!timeStr) return { hour: 12, minute: 0 };
    const [hour, minute] = timeStr.split(':').map(Number);
    return { hour: hour || 0, minute: minute || 0 };
  };

  const currentTime = parseTime(selectedTime);
  const [hour, setHour] = useState(currentTime.hour);
  const [minute, setMinute] = useState(currentTime.minute);

  const handleTimeSelect = () => {
    const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
          {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
        </div>
        <div className="text-sm text-muted-foreground">Selected Time</div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Hour Selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Hour</Label>
          <div className="max-h-32 overflow-y-auto border rounded p-2">
            <div className="grid grid-cols-4 gap-1">
              {generateOptions(0, 23).map((h) => (
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
            <div className="grid grid-cols-4 gap-1">
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
      </div>

      {/* Common Time Presets */}
      <div className="mb-4">
        <Label className="text-sm font-medium mb-2 block">Quick Select</Label>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: '00:00', value: '00:00' },
            { label: '06:00', value: '06:00' },
            { label: '12:00', value: '12:00' },
            { label: '18:00', value: '18:00' },
          ].map((preset) => (
            <Button
              key={preset.value}
              variant="outline"
              size="sm"
              onClick={() => {
                const [h, m] = preset.value.split(':').map(Number);
                setHour(h);
                setMinute(m);
              }}
              className="text-xs h-8"
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

  // Helper function to parse date strings without timezone issues
  const parseDateString = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    // Create date using local timezone (month is 0-indexed in Date constructor)
    return new Date(year, month - 1, day);
  };

  const [name, setName] = useState(account?.name || '');
  const [startDate, setStartDate] = useState<Date | null>(account?.start_date ? parseDateString(account.start_date) : null);
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
    // Use the same formatting as display but ensure we don't have timezone issues
    // by using local date components directly
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    if (account) {
      setName(account.name);
      setStartDate(account.start_date ? parseDateString(account.start_date) : null);
      setStartTime(account.start_time);
      setRequestTemplate(account.request_template);
    }
  }, [account]);
  
  useEffect(() => {
    if (!account && accountId) {
      const foundAccount = accounts.find(a => a.id === accountId);
      if (foundAccount) {
        setName(foundAccount.name);
        setStartDate(foundAccount.start_date ? parseDateString(foundAccount.start_date) : null);
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
                      onClose={() => {}} // Popover handles closing
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
                      onClose={() => {}} // Popover handles closing
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
