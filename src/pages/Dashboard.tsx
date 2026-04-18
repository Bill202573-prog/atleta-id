import { Suspense, lazy } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SchoolDashboardLayout } from '@/components/layout/SchoolDashboardLayout';
import { AdminSchoolProvider } from '@/contexts/AdminSchoolContext';
import BiometricSetupPrompt from '@/components/auth/BiometricSetupPrompt';
import { Loader2 } from 'lucide-react';

const AdminDashboard = lazy(() => import('./dashboard/AdminDashboard'));
const AdminUsersPage = lazy(() => import('./dashboard/admin/AdminUsersPage'));
const SchoolDashboard = lazy(() => import('./dashboard/SchoolDashboard'));
const TeacherDashboard = lazy(() => import('./dashboard/TeacherDashboard'));
const ChildrenManagement = lazy(() => import('./dashboard/school/ChildrenManagement'));
const TeachersManagement = lazy(() => import('./dashboard/school/TeachersManagement'));
const ClassesManagement = lazy(() => import('./dashboard/school/ClassesManagement'));
const AulasManagement = lazy(() => import('./dashboard/school/AulasManagement'));
const AmistososManagement = lazy(() => import('./dashboard/school/AmistososManagement'));
const CampeonatosManagement = lazy(() => import('./dashboard/school/CampeonatosManagement'));
const CampeonatoDetailPage = lazy(() => import('./dashboard/school/CampeonatoDetailPage'));
const SalaTrofeusPage = lazy(() => import('./dashboard/school/SalaTrofeusPage'));
const AdminSchoolsPage = lazy(() => import('./dashboard/admin/AdminSchoolsPage'));
const AdminFinanceiroPage = lazy(() => import('./dashboard/admin/AdminFinanceiroPage'));
const SchoolAdminPage = lazy(() => import('./dashboard/admin/SchoolAdminPage'));
const SchoolFinanceiroPage = lazy(() => import('./dashboard/school/SchoolFinanceiroPage'));
const SchoolChamadaPage = lazy(() => import('./dashboard/school/SchoolChamadaPage'));
const DiagnosticoAcessoPage = lazy(() => import('./dashboard/admin/DiagnosticoAcessoPage'));
const ComunicadosManagement = lazy(() => import('./dashboard/admin/ComunicadosManagement'));
const AtividadesExternasAdminPage = lazy(() => import('./dashboard/admin/AtividadesExternasAdminPage'));
const AdminRedeSocialPage = lazy(() => import('./dashboard/admin/AdminRedeSocialPage'));
const ComunicadosEscolaManagement = lazy(() => import('./dashboard/school/ComunicadosEscolaManagement'));
const IndicacoesManagement = lazy(() => import('./dashboard/school/IndicacoesManagement'));
const SchoolLojaPage = lazy(() => import('./dashboard/school/SchoolLojaPage'));
const SchoolPublicProfilePage = lazy(() => import('./dashboard/school/SchoolPublicProfilePage'));
const GuardianInicioPage = lazy(() => import('./dashboard/guardian/GuardianInicioPage'));
const GuardianAgendaPage = lazy(() => import('./dashboard/guardian/GuardianAgendaPage'));
const GuardianPerfilPage = lazy(() => import('./dashboard/guardian/GuardianPerfilPage'));
const GuardianFrequenciaPage = lazy(() => import('./dashboard/guardian/GuardianFrequenciaPage'));
const GuardianFinanceiroPage = lazy(() => import('./dashboard/guardian/GuardianFinanceiroPage'));
const GuardianJornadaPage = lazy(() => import('./dashboard/guardian/GuardianJornadaPage'));
const GuardianConvocacoesPage = lazy(() => import('./dashboard/guardian/GuardianConvocacoesPage'));
const GuardianLojaPage = lazy(() => import('./dashboard/guardian/GuardianLojaPage'));
const EventosManagement = lazy(() => import('./dashboard/school/EventosManagement'));

const DashboardLoading = () => (
  <div className="min-h-[40vh] flex items-center justify-center bg-background">
    <div className="text-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
      <p className="text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

const Dashboard = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!user.role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md p-6">
          <h2 className="text-xl font-semibold mb-2">Acesso Pendente</h2>
          <p className="text-muted-foreground">
            Sua conta foi criada mas ainda nao foi configurada com um perfil.
            Entre em contato com o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  const adminEscolinhaId = searchParams.get('escolinhaId');
  if (user.role === 'admin' && adminEscolinhaId) {
    return (
      <AdminSchoolProvider escolinhaId={adminEscolinhaId}>
        <SchoolDashboardLayout>
          <Suspense fallback={<DashboardLoading />}>
            <AdminSchoolContent />
          </Suspense>
        </SchoolDashboardLayout>
      </AdminSchoolProvider>
    );
  }

  if (user.role === 'guardian') {
    const path = location.pathname;
    if (path === '/dashboard/agenda') return <Suspense fallback={<DashboardLoading />}><GuardianAgendaPage /></Suspense>;
    if (path === '/dashboard/perfil') return <Suspense fallback={<DashboardLoading />}><GuardianPerfilPage /></Suspense>;
    if (path === '/dashboard/frequencia') return <Suspense fallback={<DashboardLoading />}><GuardianFrequenciaPage /></Suspense>;
    if (path === '/dashboard/financeiro') return <Suspense fallback={<DashboardLoading />}><GuardianFinanceiroPage /></Suspense>;
    if (path === '/dashboard/jornada') return <Suspense fallback={<DashboardLoading />}><GuardianJornadaPage /></Suspense>;
    if (path === '/dashboard/convocacoes') return <Suspense fallback={<DashboardLoading />}><GuardianConvocacoesPage /></Suspense>;
    if (path === '/dashboard/loja') return <Suspense fallback={<DashboardLoading />}><GuardianLojaPage /></Suspense>;
    return <Suspense fallback={<DashboardLoading />}><GuardianInicioPage /></Suspense>;
  }

  const renderContent = () => {
    const path = location.pathname;

    if (user.role === 'admin') {
      if (path === '/dashboard/schools') return <AdminSchoolsPage />;
      if (path === '/dashboard/financeiro') return <AdminFinanceiroPage />;
      if (path === '/dashboard/school-admin') return <SchoolAdminPage />;
      if (path === '/dashboard/diagnostico') return <DiagnosticoAcessoPage />;
      if (path === '/dashboard/comunicados') return <ComunicadosManagement />;
      if (path === '/dashboard/atividades-externas') return <AtividadesExternasAdminPage />;
      if (path === '/dashboard/rede-social') return <AdminRedeSocialPage />;
      if (path === '/dashboard/users') return <AdminUsersPage />;
    }

    if (user.role === 'school') {
      if (path === '/dashboard/children') return <ChildrenManagement />;
      if (path === '/dashboard/teachers') return <TeachersManagement />;
      if (path === '/dashboard/classes') return <ClassesManagement />;
      if (path === '/dashboard/aulas') return <AulasManagement />;
      if (path === '/dashboard/chamada') return <SchoolChamadaPage />;
      if (path === '/dashboard/amistosos') return <AmistososManagement />;
      if (path === '/dashboard/campeonatos') return <CampeonatosManagement />;
      if (path.startsWith('/dashboard/campeonatos/')) {
        const campeonatoId = path.split('/dashboard/campeonatos/')[1]?.split('/')[0];
        return <CampeonatoDetailPage campeonatoId={campeonatoId} />;
      }
      if (path === '/dashboard/trofeus') return <SalaTrofeusPage />;
      if (path === '/dashboard/comunicados') return <ComunicadosEscolaManagement />;
      if (path === '/dashboard/indicacoes') return <IndicacoesManagement />;
      if (path === '/dashboard/loja') return <SchoolLojaPage />;
      if (path === '/dashboard/perfil-publico') return <SchoolPublicProfilePage />;
      if (path === '/dashboard/financeiro') return <SchoolFinanceiroPage />;
    }

    switch (user.role) {
      case 'admin':
        return <AdminDashboard />;
      case 'school':
        return <SchoolDashboard />;
      case 'teacher':
        return <TeacherDashboard />;
      default:
        return <Navigate to="/auth" replace />;
    }
  };

  if (user.role === 'school') {
    return (
      <>
        <SchoolDashboardLayout>
          <Suspense fallback={<DashboardLoading />}>
            {renderContent()}
          </Suspense>
        </SchoolDashboardLayout>
        <BiometricSetupPrompt />
      </>
    );
  }

  return (
    <>
      <DashboardLayout>
        <Suspense fallback={<DashboardLoading />}>
          {renderContent()}
        </Suspense>
      </DashboardLayout>
      <BiometricSetupPrompt />
    </>
  );
};

const AdminSchoolContent = () => {
  const location = useLocation();
  const path = location.pathname;

  if (path === '/dashboard/children') return <ChildrenManagement />;
  if (path === '/dashboard/teachers') return <TeachersManagement />;
  if (path === '/dashboard/classes') return <ClassesManagement />;
  if (path === '/dashboard/aulas') return <AulasManagement />;
  if (path === '/dashboard/chamada') return <SchoolChamadaPage />;
  if (path === '/dashboard/amistosos') return <AmistososManagement />;
  if (path === '/dashboard/campeonatos') return <CampeonatosManagement />;
  if (path.startsWith('/dashboard/campeonatos/')) {
    const campeonatoId = path.split('/dashboard/campeonatos/')[1]?.split('/')[0];
    return <CampeonatoDetailPage campeonatoId={campeonatoId} />;
  }
  if (path === '/dashboard/trofeus') return <SalaTrofeusPage />;
  if (path === '/dashboard/comunicados') return <ComunicadosEscolaManagement />;
  if (path === '/dashboard/indicacoes') return <IndicacoesManagement />;
  if (path === '/dashboard/loja') return <SchoolLojaPage />;
  if (path === '/dashboard/perfil-publico') return <SchoolPublicProfilePage />;
  if (path === '/dashboard/financeiro') return <SchoolFinanceiroPage />;
  if (path === '/dashboard/eventos') return <EventosManagement />;

  return <SchoolDashboard />;
};

export default Dashboard;
