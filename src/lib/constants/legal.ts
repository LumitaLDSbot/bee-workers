export const LEGAL = {
  termsVersion: 'v1',
  fiscalDisclaimer: [
    'Recibes el bruto menos una comisión del 5% para Bee Workers.',
    'Tú eres responsable de declarar y pagar tu IRS y Segurança Social.',
    'Bee Workers no retiene impuestos ni actúa como empleador.',
    'La app muestra estimaciones orientativas, pero no sustituye asesoría fiscal.',
  ],
  workerResponsibilities: [
    'Emitir recibo verde por cada servicio facturado.',
    'Declarar IRS en Categoría B mediante Modelo 3 + Anexo B.',
    'Declarar Segurança Social trimestralmente cuando corresponda.',
    'Mantener actividad abierta nas Finanças.',
    'Mantener seguro de acidentes de trabalho vigente.',
  ],
  tutorial: {
    irs: [
      'El IRS de trabajadores independientes se declara anualmente con el Modelo 3.',
      'En régimen simplificado, normalmente tributa el 75% del rendimiento bruto.',
      'Debes incluir Anexo B para rendimientos de categoría B.',
      'Consulta el Portal das Finanças para confirmar plazos y obligaciones.',
    ],
    ss: [
      'La Segurança Social de trabajadores independientes se declara trimestralmente.',
      'La base habitual se calcula sobre el 70% del rendimiento relevante.',
      'El tipo general es 21,4% para trabalhadores independentes.',
      'Puedes existir exención durante los primeros 12 meses tras iniciar actividad.',
      'Gestiona tus declaraciones en seg-social.pt.',
    ],
    financas: [
      'Debes abrir actividad nas Finanças antes de facturar.',
      'Puedes hacerlo online en el Portal das Finanças.',
      'Selecciona categoría B / trabalhadores independentes.',
      'Verifica si aplicas exención de IVA por volumen de facturación inferior a 15.000€.',
    ],
    seguro: [
      'El seguro de acidentes de trabalho es obligatorio para trabajadores independientes.',
      'Puedes contratarlo en aseguradoras portuguesas autorizadas.',
      'Guarda el comprobante y la fecha de caducidad en tu perfil.',
      'Sin seguro vigente no deberías aceptar servicios.',
    ],
  },
} as const;
