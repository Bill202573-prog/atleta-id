import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMyPerfilAtleta } from '@/hooks/useAtletaIdData';
import { AtletaIdLayout } from '@/components/layout/AtletaIdLayout';
import { CreatePerfilForm } from '@/components/atleta-id/CreatePerfilForm';
import { PerfilHeader } from '@/components/atleta-id/PerfilHeader';
import { AtletaTimeline } from '@/components/atleta-id/AtletaTimeline';
import { CarreiraIdSyncTab } from '@/components/atleta-id/CarreiraIdSyncTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, User, RefreshCw } from 'lucide-react';

export default function AtletaIdLinkedinPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: perfil, isLoading: perfilLoading } = useMyPerfilAtleta();

  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  const isLoading = authLoading || perfilLoading;

  return (
    <AtletaIdLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Meu Perfil de Atleta</h1>
          <p className="text-muted-foreground">Sua vitrine esportiva pública</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : perfil ? (
          <div className="space-y-6">
            <PerfilHeader perfil={perfil} isOwner={true} />

            <Tabs defaultValue="perfil" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="perfil" className="flex-1 gap-2">
                  <User className="w-4 h-4" />
                  Perfil
                </TabsTrigger>
                <TabsTrigger value="carreira" className="flex-1 gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Carreira ID
                </TabsTrigger>
              </TabsList>

              <TabsContent value="perfil" className="mt-4">
                <AtletaTimeline perfil={perfil} isOwner={true} />
              </TabsContent>

              <TabsContent value="carreira" className="mt-4">
                <CarreiraIdSyncTab perfil={perfil} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <CreatePerfilForm />
        )}
      </div>
    </AtletaIdLayout>
  );
}
