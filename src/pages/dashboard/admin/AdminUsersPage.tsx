import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, User, Mail, Phone, Shield, Clock, Smartphone, Monitor, Globe } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UserResult {
  user_id: string;
  nome: string;
  email: string;
  role: string;
  telefone?: string;
  escolinha_nome?: string;
  avatar_url?: string;
}

interface AcessoLog {
  accessed_at: string;
  user_role: string;
  user_agent: string | null;
  ip_address: string | null;
}

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  school: 'Escola',
  teacher: 'Professor',
  guardian: 'Responsável',
};

const roleColors: Record<string, string> = {
  admin: 'bg-destructive/10 text-destructive border-destructive/20',
  school: 'bg-primary/10 text-primary border-primary/20',
  teacher: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  guardian: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

function parseUserAgent(ua: string | null) {
  if (!ua) return { device: 'Desconhecido', browser: '' };
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  
  let browser = 'Navegador';
  if (ua.includes('SamsungBrowser')) browser = 'Samsung Browser';
  else if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Mac OS')) os = 'Mac';
  else if (ua.includes('Linux')) os = 'Linux';

  const device = isTablet ? 'Tablet' : isMobile ? 'Celular' : 'Computador';
  return { device, browser, os, isMobile };
}

const AdminUsersPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [acessos, setAcessos] = useState<AcessoLog[]>([]);
  const [loadingAcessos, setLoadingAcessos] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) return;
    setIsSearching(true);
    setHasSearched(true);
    setSelectedUser(null);
    setAcessos([]);

    try {
      // Search profiles by name or email
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nome, email, avatar_url')
        .or(`nome.ilike.%${searchTerm.trim()}%,email.ilike.%${searchTerm.trim()}%`)
        .limit(20);

      if (!profiles || profiles.length === 0) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      // Get roles for found users
      const userIds = profiles.map(p => p.user_id);
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      // Get phone numbers for guardians
      const { data: responsaveis } = await supabase
        .from('responsaveis')
        .select('user_id, telefone')
        .in('user_id', userIds);

      const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      const phonesMap = new Map(responsaveis?.map(r => [r.user_id, r.telefone]) || []);

      const mapped: UserResult[] = profiles.map(p => ({
        user_id: p.user_id,
        nome: p.nome,
        email: p.email,
        role: rolesMap.get(p.user_id) || 'sem role',
        telefone: phonesMap.get(p.user_id) || undefined,
        avatar_url: p.avatar_url || undefined,
      }));

      setResults(mapped);
    } catch (err) {
      console.error('Search error:', err);
    }
    setIsSearching(false);
  };

  const handleSelectUser = async (user: UserResult) => {
    setSelectedUser(user);
    setLoadingAcessos(true);

    try {
      const { data } = await supabase
        .from('acessos_log')
        .select('accessed_at, user_role, user_agent, ip_address')
        .eq('user_id', user.user_id)
        .order('accessed_at', { ascending: false })
        .limit(30);

      setAcessos(data || []);
    } catch (err) {
      console.error('Error loading access logs:', err);
    }
    setLoadingAcessos(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pesquisar Usuários</h1>
        <p className="text-muted-foreground">Busque por nome ou email e veja o histórico de acessos</p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Nome ou email do usuário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || searchTerm.trim().length < 2}>
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Results */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resultados</CardTitle>
            {hasSearched && (
              <CardDescription>
                {results.length === 0 ? 'Nenhum usuário encontrado' : `${results.length} encontrado(s)`}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {results.length === 0 && !hasSearched && (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Digite um nome ou email para buscar</p>
              </div>
            )}
            {results.length === 0 && hasSearched && !isSearching && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Nenhum resultado para "{searchTerm}"</p>
              </div>
            )}
            <div className="space-y-2">
              {results.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => handleSelectUser(u)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedUser?.user_id === u.user_id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-secondary/30 hover:bg-secondary/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{u.nome}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Mail className="w-3 h-3 shrink-0" /> {u.email}
                      </p>
                      {u.telefone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 shrink-0" /> {u.telefone}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${roleColors[u.role] || ''}`}>
                      {roleLabels[u.role] || u.role}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Access Log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Histórico de Acessos
            </CardTitle>
            {selectedUser && (
              <CardDescription>{selectedUser.nome} — {selectedUser.email}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {!selectedUser && (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Selecione um usuário para ver o histórico</p>
              </div>
            )}
            {selectedUser && loadingAcessos && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
            {selectedUser && !loadingAcessos && acessos.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm font-medium">Nenhum acesso registrado</p>
                <p className="text-xs mt-1">Este usuário nunca acessou o sistema (ou acessou antes do log ser implementado)</p>
              </div>
            )}
            {selectedUser && !loadingAcessos && acessos.length > 0 && (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {acessos.map((a, i) => {
                  const parsed = parseUserAgent(a.user_agent);
                  const DeviceIcon = parsed.device === 'Celular' ? Smartphone : parsed.device === 'Tablet' ? Globe : Monitor;
                  return (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 text-sm">
                      <DeviceIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground font-medium text-xs">
                          {format(new Date(a.accessed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {parsed.device} • {parsed.os} • {parsed.browser}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(a.accessed_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminUsersPage;
