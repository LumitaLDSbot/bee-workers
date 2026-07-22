'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminGetMetricsAction,
  adminGetUsersAction,
  adminSetVerificationAction,
  adminSetSuspensionAction,
  adminGetPendingDocumentsAction,
  adminReviewDocumentAction,
  adminGetDisputesAction,
  adminResolveDisputeAction,
} from '@/server/actions/admin.actions';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  FullLoader,
  Input,
  Select,
  SimpleBarChart,
  StatCard,
  Tabs,
} from '@/components/ui';
import { formatDateTime, formatEUR } from '@/lib/utils/format';

export default function AdminPage() {
  const [tab, setTab] = useState('metrics');

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="rounded-3xl bg-[#1A1A1A] p-6 text-white">
          <h1 className="text-3xl font-black">Admin Bee Workers</h1>
          <p className="mt-1 text-sm text-white/70">
            Gestión de usuarios, verificación, métricas y disputas.
          </p>
        </div>

        <Tabs
          tabs={[
            { id: 'metrics', label: 'Métricas' },
            { id: 'users', label: 'Usuarios' },
            { id: 'verification', label: 'Verificación' },
            { id: 'disputes', label: 'Disputas' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'metrics' && <AdminMetrics />}
        {tab === 'users' && <AdminUsers />}
        {tab === 'verification' && <AdminVerification />}
        {tab === 'disputes' && <AdminDisputes />}
      </main>
    </div>
  );
}

function AdminMetrics() {
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await adminGetMetricsAction();

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setMetrics(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <FullLoader />;
  if (error) return <ErrorState message={error} retry={load} />;
  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workers" value={String(metrics.totalWorkers)} icon="👷" />
        <StatCard label="Employers" value={String(metrics.totalEmployers)} icon="🏢" />
        <StatCard
          label="Pendientes verificación"
          value={String(metrics.pendingVerification)}
          icon="🪪"
        />
        <StatCard
          label="Activos 30d"
          value={String(metrics.activeUsers30d)}
          icon="📈"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Turnos este mes"
          value={String(metrics.shiftsThisMonth)}
          icon="📅"
        />
        <StatCard
          label="Completados este mes"
          value={String(metrics.completedShiftsMonth)}
          icon="✅"
        />
        <StatCard label="GMV mes" value={formatEUR(metrics.gmvMonth)} icon="💶" />
        <StatCard
          label="Comisiones mes"
          value={formatEUR(metrics.commissionMonth)}
          icon="🐝"
        />
      </section>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold">GMV mensual</h2>

        <SimpleBarChart
          data={metrics.monthlyGmv.map((item: any) => ({
            label: item.label,
            value: item.gmv,
          }))}
          formatValue={formatEUR}
        />
      </Card>
    </div>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [role, setRole] = useState('');
  const [verification, setVerification] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await adminGetUsersAction({
      role: role ? (role as 'worker' | 'employer') : undefined,
      verification: verification
        ? (verification as 'pending' | 'approved' | 'rejected')
        : undefined,
      search,
      page,
      pageSize: 20,
    });

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setUsers(result.data.users);
    setTotal(result.data.total);
    setLoading(false);
  }, [role, verification, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleVerify = async (userId: string, status: 'approved' | 'rejected') => {
    await adminSetVerificationAction({ userId, status });
    await load();
  };

  const handleSuspend = async (userId: string, suspended: boolean) => {
    await adminSetSuspensionAction({ userId, suspended });
    await load();
  };

  return (
    <div className="space-y-4">
      <Card className="grid gap-4 md:grid-cols-4">
        <Input
          label="Buscar"
          placeholder="Nombre, email, teléfono"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />

        <Select
          label="Rol"
          value={role}
          onChange={e => {
            setRole(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos</option>
          <option value="worker">Workers</option>
          <option value="employer">Employers</option>
        </Select>

        <Select
          label="Verificación"
          value={verification}
          onChange={e => {
            setVerification(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas</option>
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobados</option>
          <option value="rejected">Rechazados</option>
        </Select>

        <div className="flex items-end">
          <Button className="w-full" onClick={load}>
            Filtrar
          </Button>
        </div>
      </Card>

      {loading && <FullLoader />}
      {!loading && error && <ErrorState message={error} retry={load} />}

      {!loading && !error && (
        <>
          <div className="space-y-3">
            {users.map(user => (
              <Card key={user.id} className="space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold">
                      {user.full_name || user.email || user.id}
                    </p>
                    <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                      {user.email} · {user.role}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="muted">{user.verification_status}</Badge>
                      {user.is_suspended && <Badge variant="danger">Suspendido</Badge>}
                      {user.delete_requested_at && (
                        <Badge variant="danger">Borrado solicitado</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleVerify(user.id, 'approved')}
                    >
                      Aprobar
                    </Button>

                    <Button
                      variant="danger"
                      onClick={() => handleVerify(user.id, 'rejected')}
                    >
                      Rechazar
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleSuspend(user.id, !user.is_suspended)}
                    >
                      {user.is_suspended ? 'Reactivar' : 'Suspender'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Anterior
            </Button>

            <span className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              {total} usuarios · página {page + 1}
            </span>

            <Button
              variant="secondary"
              disabled={(page + 1) * 20 >= total}
              onClick={() => setPage(p => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AdminVerification() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await adminGetPendingDocumentsAction();

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDocs(result.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleReview = async (
    documentId: string,
    status: 'approved' | 'rejected'
  ) => {
    await adminReviewDocumentAction({ documentId, status });
    await load();
  };

  if (loading) return <FullLoader />;
  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="space-y-4">
      {docs.length === 0 ? (
        <Card>
          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
            No hay documentos pendientes de revisión.
          </p>
        </Card>
      ) : (
        docs.map(doc => (
          <Card key={doc.id} className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold">{doc.doc_type}</p>
                <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                  {doc.users?.full_name || doc.users?.email || doc.user_id}
                </p>
                <p className="text-xs text-[#8B8B8B] dark:text-neutral-500">
                  {formatDateTime(doc.created_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {doc.signedUrl && (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline">Ver documento</Button>
                  </a>
                )}

                <Button onClick={() => handleReview(doc.id, 'approved')}>
                  Aprobar
                </Button>

                <Button variant="danger" onClick={() => handleReview(doc.id, 'rejected')}>
                  Rechazar
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function AdminDisputes() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await adminGetDisputesAction();

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDisputes(result.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (disputeId: string, status: 'resolved' | 'closed') => {
    await adminResolveDisputeAction({ disputeId, status });
    await load();
  };

  if (loading) return <FullLoader />;
  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="space-y-4">
      {disputes.length === 0 ? (
        <Card>
          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
            No hay disputas abiertas.
          </p>
        </Card>
      ) : (
        disputes.map(dispute => (
          <Card key={dispute.id} className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p className="font-bold">Reporte</p>
                <p className="text-sm text-[#1A1A1A] dark:text-neutral-200">
                  {dispute.reason}
                </p>

                <p className="text-xs text-[#8B8B8B] dark:text-neutral-500">
                  Reporter: {dispute.reporter?.full_name || dispute.reporter?.email}
                </p>

                <p className="text-xs text-[#8B8B8B] dark:text-neutral-500">
                  Reported: {dispute.reported?.full_name || dispute.reported?.email}
                </p>

                <div className="mt-2">
                  <Badge
                    variant={
                      dispute.status === 'open'
                        ? 'warning'
                        : dispute.status === 'resolved'
                          ? 'success'
                          : 'muted'
                    }
                  >
                    {dispute.status}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => handleResolve(dispute.id, 'resolved')}>
                  Marcar resuelta
                </Button>

                <Button variant="secondary" onClick={() => handleResolve(dispute.id, 'closed')}>
                  Cerrar
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}