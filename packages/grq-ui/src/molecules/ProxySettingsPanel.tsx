import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, ShieldCheck, Loader2, Save, Link2, ActivitySquare, Send } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@grq/ui/atoms/select';
import { toast } from 'sonner';
import { Badge } from '@grq/ui/atoms/badge';
import { cn } from '@grq/ui/lib/utils';

interface ProxyConfig {
  enabled: boolean;
  type: string | null;
  host: string | null;
  port: number | null;
  username: string | null;
  password: string | null;
  secret: string | null;
  package_name?: string | null;
  expiry?: string | null;
  created?: string | null;
  status?: string | null;
  country?: string | null;
  provider?: string | null;
  rotation_time?: string | null;
  remaining_time?: string | null;
}

export function ProxySettingsPanel() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [proxyType, setProxyType] = useState<string>('http');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  
  const [packageName, setPackageName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [created, setCreated] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [provider, setProvider] = useState('');
  const [rotationTime, setRotationTime] = useState('');
  const [remainingTime, setRemainingTime] = useState('');
  
  const [proxyLink, setProxyLink] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await invoke<ProxyConfig>('get_proxy_config');
      setEnabled(config.enabled || false);
      setProxyType(config.type || 'http');
      setHost(config.host || '');
      setPort(config.port ? String(config.port) : '');
      setUsername(config.username || '');
      setPassword(config.password || '');
      setSecret(config.secret || '');
      
      setPackageName(config.package_name || '');
      setExpiry(config.expiry || '');
      setCreated(config.created || '');
      setStatus(config.status || '');
      setCountry(config.country || '');
      setProvider(config.provider || '');
      setRotationTime(config.rotation_time || '');
      setRemainingTime(config.remaining_time || '');
    } catch (error) {
      console.error('Failed to load Proxy config:', error);
      toast.error('Failed to load proxy configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await invoke('set_proxy_config', {
        enabled,
        proxyType: proxyType || null,
        host: host || null,
        port: port ? parseInt(port, 10) : null,
        username: username || null,
        password: password || null,
        secret: secret || null,
        package_name: packageName || null,
        expiry: expiry || null,
        created: created || null,
        status: status || null,
        country: country || null,
        provider: provider || null,
        rotation_time: rotationTime || null,
        remaining_time: remainingTime || null,
        reminder_sent: false
      });
      toast.success('Proxy configuration saved');
    } catch (error) {
      console.error('Failed to save proxy config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleParseLink = async () => {
    if (!proxyLink) return;
    try {
      setParsing(true);
      const parsed = await invoke<any>('parse_proxy_link', { link: proxyLink });
      if (parsed.type) setProxyType(parsed.type);
      if (parsed.host) setHost(parsed.host);
      if (parsed.port) setPort(String(parsed.port));
      if (parsed.username !== undefined) setUsername(parsed.username || '');
      if (parsed.password !== undefined) setPassword(parsed.password || '');
      if (parsed.secret !== undefined) setSecret(parsed.secret || '');
      
      if (parsed.package_name !== undefined) setPackageName(parsed.package_name || '');
      if (parsed.expiry !== undefined) setExpiry(parsed.expiry || '');
      if (parsed.created !== undefined) setCreated(parsed.created || '');
      if (parsed.status !== undefined) setStatus(parsed.status || '');
      if (parsed.country !== undefined) setCountry(parsed.country || '');
      if (parsed.provider !== undefined) setProvider(parsed.provider || '');
      if (parsed.rotation_time !== undefined) setRotationTime(parsed.rotation_time || '');
      if (parsed.remaining_time !== undefined) setRemainingTime(parsed.remaining_time || '');
      
      setEnabled(true);
      toast.success('Proxy link parsed successfully! Click save to apply.');
    } catch (error: any) {
      console.error('Failed to parse proxy link:', error);
      toast.error(`Invalid proxy text/link: ${error}`);
    } finally {
      setParsing(false);
    }
  };

  const handleTestProxy = async () => {
    if (!host || !port) {
      toast.error('Please enter Host and Port first.');
      return;
    }
    try {
      setTesting(true);
      const res = await invoke<string>('test_proxy_connection', {
        proxyType: proxyType || null,
        host: host || null,
        port: port ? parseInt(port, 10) : null,
        username: username || null,
        password: password || null,
      });
      toast.success(res);
    } catch (error: any) {
      console.error('Proxy test failed:', error);
      toast.error(error);
    } finally {
      setTesting(false);
    }
  };

  const handleSendToTelegram = async () => {
    try {
      setSharing(true);
      await invoke('send_proxy_details_to_telegram');
      toast.success('Proxy details sent to Telegram!');
    } catch (error: any) {
      console.error('Failed to send to Telegram:', error);
      toast.error(error);
    } finally {
      setSharing(false);
    }
  };

  const getHoursRemaining = (expiryStr: string, remainingStr: string) => {
    // Priority 1: Parse "X days Y hours" from the message
    if (remainingStr) {
      const daysMatch = remainingStr.match(/(\d+)\s*days?/i);
      const hoursMatch = remainingStr.match(/(\d+)\s*hours?/i);
      let totalHours = 0;
      if (daysMatch) totalHours += parseInt(daysMatch[1], 10) * 24;
      if (hoursMatch) totalHours += parseInt(hoursMatch[1], 10);
      if (totalHours > 0) return totalHours;
    }

    // Priority 2: Calculate from absolute expiry date
    if (expiryStr) {
      try {
        const expiryDate = new Date(expiryStr.replace(' ', 'T'));
        if (!isNaN(expiryDate.getTime())) {
          const now = new Date();
          const diffMs = expiryDate.getTime() - now.getTime();
          return Math.floor(diffMs / (1000 * 60 * 60));
        }
      } catch (e) {}
    }

    return null;
  };

  const hoursRemaining = getHoursRemaining(expiry, remainingTime);
  const daysDisplay = hoursRemaining !== null ? Math.ceil(hoursRemaining / 24) : null;

  if (loading) return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            <CardTitle>Proxy Settings</CardTitle>
          </div>
          <Badge variant={enabled ? "default" : "secondary"} className={cn(enabled ? "bg-green-500" : "")}>
            {enabled ? "Active" : "Disabled"}
          </Badge>
        </div>
        <CardDescription>
          Configure a proxy connection for the app. {daysDisplay !== null && (
            <span className="text-primary font-bold block mt-1 animate-pulse">
              {t('settings.proxy.daysRemaining', { count: daysDisplay })}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Link Parser Widget */}
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-background/50 border border-primary/20">
          <label className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Smart Telegram Link / Bot Message
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="Paste proxy link or proxy bot message here..."
              value={proxyLink}
              onChange={(e) => setProxyLink(e.target.value)}
              className="bg-background focus:border-primary"
            />
            <Button 
                variant="default" 
                onClick={handleParseLink} 
                disabled={!proxyLink || parsing}
                className="shrink-0 font-bold"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Extract"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground ml-1">
             Paste a standard Telegram proxy link (tg://) or copy-paste the entire proxy details message sent by your provider bot.
          </p>
        </div>

        {/* Manual Configuration */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">Proxy Type</label>
            <Select value={proxyType} onValueChange={setProxyType}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP / HTTPS</SelectItem>
                <SelectItem value="socks5">SOCKS5</SelectItem>
                <SelectItem value="mtproxy">MTProxy (Telegram)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
             {/* empty grid spacer on desktop if needed, or leave it for alignment */}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">Host / Server</label>
            <Input
              placeholder="e.g. 127.0.0.1"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="bg-background/50"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">Port</label>
            <Input
              type="number"
              placeholder="e.g. 1080"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="bg-background/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">Username <span className="text-muted-foreground font-normal">(Optional)</span></label>
            <Input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-background/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">Password <span className="text-muted-foreground font-normal">(Optional)</span></label>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background/50"
            />
          </div>

          {proxyType === 'mtproxy' && (
             <div className="flex flex-col gap-2 sm:col-span-2">
               <label className="text-sm font-semibold text-blue-500">MTProxy Secret <span className="text-muted-foreground font-normal">(Required for MTProxy)</span></label>
               <Input
                 type="password"
                 placeholder="Secret block (e.g. eeeee...)"
                 value={secret}
                 onChange={(e) => setSecret(e.target.value)}
                 className="bg-blue-500/5 focus:border-blue-500"
               />
             </div>
          )}
        </div>

        <div className="flex flex-col gap-4 py-2 mt-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-background/40 border-2 border-primary/10">
            <div className="space-y-0.5">
              <div className="text-sm font-bold flex items-center gap-2">
                Enable Proxy Integration
                {enabled && <ShieldCheck className="h-3 w-3 text-green-500" />}
              </div>
              <div className="text-[10px] text-muted-foreground">Route applicable app traffic through this proxy</div>
            </div>
            <button
               onClick={() => setEnabled(!enabled)}
               className={cn(
                 "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                 enabled ? "bg-primary" : "bg-muted"
               )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                enabled ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4 border-t border-primary/10">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              className="flex-1 rounded-xl h-11 font-bold shadow-lg shadow-primary/20"
              onClick={handleSave}
              disabled={saving || testing || sharing}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Configuration
            </Button>

            <Button 
              variant="outline"
              className="flex-1 rounded-xl h-11 font-bold border-primary/20 hover:bg-primary/5"
              onClick={handleTestProxy}
              disabled={saving || testing || sharing || !host || !port}
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ActivitySquare className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
          </div>

          {hoursRemaining !== null && hoursRemaining <= 36 && (
            <Button 
              variant="secondary"
              className="w-full rounded-xl h-11 font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20"
              onClick={handleSendToTelegram}
              disabled={saving || testing || sharing || !host || !port}
            >
              {sharing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {t('settings.proxy.alertGroup')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
