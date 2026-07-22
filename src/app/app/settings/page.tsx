'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getSettingsDataAction,
  updateNotificationSettingsAction,
  updateUserSettingsAction,
  requestDeleteAccountAction,
  cancelDeleteAccountAction,
} from '@/server/actions/settings.actions';
import { updateWorkerProfileAction, updateEmployerProfileAction } from '@/server/actions/profile.actions';
import {
  Button,
  Card,
  FullLoader,
  Input,
  Modal,
  Select,
  Toggle,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { uploadImage, buildImagePath } from '@/lib/utils/storage';
import type { Language } from '@/lib/i18n';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const [language, setLanguage] = useState<Language>('es');

  const [workerForm, setWorkerForm] = useState({
    fullName: '',
    hourlyRate: '',
    workRadiusKm: '',
    professions: '',
    skills: '',
    isActive: true,
    profilePhotoUrl: '',
  });

  const [employerForm, setEmployerForm] = useState({
    companyName: '',
    address: '',
    email: '',
    phone: '',
    logoUrl: '',
  });

  const [notificationSettings, setNotificationSettings] = useState({
    new_shift_nearby: true,
    new_application: true,
    application_accepted: true,
    application_rejected: true,
    worker_checked_in: true,
    worker_checked_out: true,
    rating_pending: true,
    marketing: false,
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const result = await getSettingsDataAction();

    if (result.success) {
      const {
        user,
        workerProfile,
        employerProfile,
        settings,
        notificationSettings: notif,
      } = result.data;

      setData(result.data);

      if (settings?.language) {
        setLanguage(settings.language as Language);
      }

      if (settings?.theme) {
        setTheme(settings.theme as 'light' | 'dark');
      }

      if (workerProfile) {
        setWorkerForm({
          fullName: workerProfile.full_name || user?.full_name || '',
          hourlyRate: String(workerProfile.hourly_rate ?? ''),
          workRadiusKm: String(workerProfile.work_radius_km ?? ''),
          professions: (workerProfile.professions ?? []).join(', '),
          skills: (workerProfile.skills ?? []).join(', '),
          isActive: workerProfile.is_active ?? true,
          profilePhotoUrl: user?.profile_photo_url || '',
        });
      }

      if (employerProfile) {
        setEmployerForm({
          companyName: employerProfile.company_name || '',
          address: employerProfile.address || '',
          email: user?.email || '',
          phone: user?.phone || '',
          logoUrl: employerProfile.logo_url || user?.profile_photo_url || '',
        });
      }

      if (notif) {
        setNotificationSettings({
          new_shift_nearby: notif.new_shift_nearby,
          new_application: notif.new_application,
          application_accepted: notif.application_accepted,
          application_rejected: notif.application_rejected,
          worker_checked_in: notif.worker_checked_in,
          worker_checked_out: notif.worker_checked_out,
          rating_pending: notif.rating_pending,
          marketing: notif.marketing,
        });
      }
    }

    setLoading(false);
  }, [setTheme]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveWorker = async () => {
    setSaving(true);

    await updateWorkerProfileAction({
      fullName: workerForm.fullName,
      hourlyRate: Number(workerForm.hourlyRate || 0),
      workRadiusKm: Number(workerForm.workRadiusKm || 0),
      professions: workerForm.professions
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
      skills: workerForm.skills
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
      isActive: workerForm.isActive,
      profilePhotoUrl: workerForm.profilePhotoUrl,
    });

    setSaving(false);
    alert('Perfil actualizado.');
  };

  const handleSaveEmployer = async () => {
    setSaving(true);

    await updateEmployerProfileAction({
      companyName: employerForm.companyName,
      address: employerForm.address,
      email: employerForm.email,
      phone: employerForm.phone,
      logoUrl: employerForm.logoUrl,
    });

    setSaving(false);
    alert('Perfil de empresa actualizado.');
  };

  const handleSavePreferences = async () => {
    setSaving(true);

    await Promise.all([
      updateUserSettingsAction({ language, theme }),
      updateNotificationSettingsAction(notificationSettings),
    ]);

    setSaving(false);
    alert('Preferencias guardadas.');
  };

  const handlePhotoUpload = async (file: File, role: 'worker' | 'employer') => {
    if (!data?.user?.id) return;

    try {
      const path = buildImagePath(
        data.user.id,
        role === 'worker' ? 'avatar' : 'logo',
        file
      );

      const url = await uploadImage({
        bucket: 'profile-photos',
        path,
        file,
      });

      if (role === 'worker') {
        setWorkerForm(prev => ({ ...prev, profilePhotoUrl: url }));
      } else {
        setEmployerForm(prev => ({ ...prev, logoUrl: url }));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al subir imagen');
    }
  };

  const handleRequestDelete = async () => {
    await requestDeleteAccountAction();
    setDeleteOpen(false);
    alert('Cuenta marcada para eliminación. Tienes 30 días para cancelar.');
    await load();
  };

  const handleCancelDelete = async () => {
    await cancelDeleteAccountAction();
    alert('Eliminación cancelada.');
    await load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando ajustes..." />
      </div>
    );
  }

  const hasWorker = Boolean(data?.workerProfile);
  const hasEmployer = Boolean(data?.employerProfile);
  const deleteRequestedAt = data?.user?.delete_requested_at;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-3xl font-black">Configuración</h1>

        {deleteRequestedAt && (
          <Card className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
            <p className="text-sm text-red-700 dark:text-red-300">
              Tu cuenta está programada para eliminación. Puedes cancelarla antes de
              30 días.
            </p>
            <Button variant="danger" className="mt-3" onClick={handleCancelDelete}>
              Cancelar eliminación
            </Button>
          </Card>
        )}

        {/* Preferencias */}
        <Card className="space-y-5">
          <h2 className="text-lg font-bold">Preferencias</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Idioma"
              value={language}
              onChange={e => setLanguage(e.target.value as Language)}
            >
              <option value="es">Español</option>
              <option value="pt">Portugués</option>
              <option value="en">English</option>
            </Select>

            <div className="space-y-2">
              <p className="text-sm font-medium">Dark mode</p>
              <Toggle
                checked={theme === 'dark'}
                onChange={value => setTheme(value ? 'dark' : 'light')}
                label={theme === 'dark' ? 'Activado' : 'Desactivado'}
              />
            </div>
          </div>

          <Button onClick={handleSavePreferences} loading={saving}>
            Guardar preferencias
          </Button>
        </Card>

        {/* Worker */}
        {hasWorker && (
          <Card className="space-y-5">
            <h2 className="text-lg font-bold">Perfil Worker</h2>

            <div className="flex items-center gap-4">
              {workerForm.profilePhotoUrl && (
                <img
                  src={workerForm.profilePhotoUrl}
                  alt="Avatar"
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              )}

              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file, 'worker');
                }}
              />
            </div>

            <Input
              label="Nombre completo"
              value={workerForm.fullName}
              onChange={e =>
                setWorkerForm(prev => ({ ...prev, fullName: e.target.value }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Precio/hora"
                type="number"
                value={workerForm.hourlyRate}
                onChange={e =>
                  setWorkerForm(prev => ({ ...prev, hourlyRate: e.target.value }))
                }
              />

              <Input
                label="Radio de trabajo (km)"
                type="number"
                value={workerForm.workRadiusKm}
                onChange={e =>
                  setWorkerForm(prev => ({ ...prev, workRadiusKm: e.target.value }))
                }
              />
            </div>

            <Input
              label="Profesiones (separadas por coma)"
              value={workerForm.professions}
              onChange={e =>
                setWorkerForm(prev => ({ ...prev, professions: e.target.value }))
              }
            />

            <Input
              label="Skills (separadas por coma)"
              value={workerForm.skills}
              onChange={e =>
                setWorkerForm(prev => ({ ...prev, skills: e.target.value }))
              }
            />

            <Toggle
              label="Disponible para aceptar turnos"
              checked={workerForm.isActive}
              onChange={value =>
                setWorkerForm(prev => ({ ...prev, isActive: value }))
              }
            />

            <Button onClick={handleSaveWorker} loading={saving}>
              Guardar perfil worker
            </Button>
          </Card>
        )}

        {/* Employer */}
        {hasEmployer && (
          <Card className="space-y-5">
            <h2 className="text-lg font-bold">Perfil Employer</h2>

            <div className="flex items-center gap-4">
              {employerForm.logoUrl && (
                <img
                  src={employerForm.logoUrl}
                  alt="Logo"
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              )}

              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file, 'employer');
                }}
              />
            </div>

            <Input
              label="Nombre de empresa"
              value={employerForm.companyName}
              onChange={e =>
                setEmployerForm(prev => ({ ...prev, companyName: e.target.value }))
              }
            />

            <Input
              label="Dirección"
              value={employerForm.address}
              onChange={e =>
                setEmployerForm(prev => ({ ...prev, address: e.target.value }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Email"
                value={employerForm.email}
                onChange={e =>
                  setEmployerForm(prev => ({ ...prev, email: e.target.value }))
                }
              />

              <Input
                label="Teléfono"
                value={employerForm.phone}
                onChange={e =>
                  setEmployerForm(prev => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>

            <Button onClick={handleSaveEmployer} loading={saving}>
              Guardar perfil employer
            </Button>
          </Card>
        )}

        {/* Notificaciones */}
        <Card className="space-y-5">
          <h2 className="text-lg font-bold">Notificaciones</h2>

          <div className="space-y-4">
            <Toggle
              label="Nuevos turnos cercanos"
              checked={notificationSettings.new_shift_nearby}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  new_shift_nearby: value,
                }))
              }
            />

            <Toggle
              label="Nuevas aplicaciones"
              checked={notificationSettings.new_application}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  new_application: value,
                }))
              }
            />

            <Toggle
              label="Aplicación aceptada"
              checked={notificationSettings.application_accepted}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  application_accepted: value,
                }))
              }
            />

            <Toggle
              label="Aplicación rechazada"
              checked={notificationSettings.application_rejected}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  application_rejected: value,
                }))
              }
            />

            <Toggle
              label="Check-in / check-out"
              checked={notificationSettings.worker_checked_in}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  worker_checked_in: value,
                  worker_checked_out: value,
                }))
              }
            />

            <Toggle
              label="Valoraciones pendientes"
              checked={notificationSettings.rating_pending}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  rating_pending: value,
                }))
              }
            />

            <Toggle
              label="Marketing"
              checked={notificationSettings.marketing}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  marketing: value,
                }))
              }
            />
          </div>

          <Button onClick={handleSavePreferences} loading={saving}>
            Guardar notificaciones
          </Button>
        </Card>

        {/* Eliminar cuenta */}
        <Card className="space-y-4 border-red-200 dark:border-red-900/40">
          <h2 className="text-lg font-bold text-red-700 dark:text-red-300">
            Eliminar cuenta
          </h2>

          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
            Tu cuenta se marcará para eliminación y se eliminará tras un período de
            gracia de 30 días.
          </p>

          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Solicitar eliminación
          </Button>
        </Card>
      </main>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar cuenta">
        <div className="space-y-4">
          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
            ¿Seguro que quieres eliminar tu cuenta? Podrás cancelar durante 30 días.
          </p>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>

            <Button variant="danger" className="flex-1" onClick={handleRequestDelete}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}