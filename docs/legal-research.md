# Investigación Legal: Plataforma de Intermediación Laboral en Portugal

**Fecha:** 22 de julio de 2026
**Propósito:** Bee Workers — Plataforma que conecta trabajadores con empleadores para turnos puntuales/temporales
**Jurisdicción:** Portugal (UE)

---

## Índice

1. [Marco Legal del Trabajo Temporário](#1-marco-legal-del-trabajo-temporário)
2. [Seguro de Responsabilidad y Accidentes](#2-seguro-de-responsabilidad-y-accidentes)
3. [Trabajador Independiente (Autónomo)](#3-trabajador-independiente-autónomo)
4. [Modelo de Plataforma Digital](#4-modelo-de-plataforma-digital)
5. [KYC y Verificación de Identidad](#5-kyc-y-verificación-de-identidad)
6. [Protección de Datos (GDPR/RGPD)](#6-protección-de-datos-gdprrgpd)
7. [Resumen Ejecutivo y Recomendaciones](#7-resumen-ejecutivo-y-recomendaciones)

---

## 1. Marco Legal del Trabajo Temporário

### 1.1 Régimen jurídico aplicable

El trabajo temporário en Portugal está regulado principalmente por:

- **Decreto-Lei n.º 260/2009, de 25 de setembro** — Regula el régimen jurídico del ejercicio y licenciamiento de las agencias privadas de colocación y de las empresas de trabajo temporário (ETT). Es la norma central.
- **Lei n.º 7/2009, de 12 de fevereiro** — Código do Trabalho (CT), artículos 172.º a 192.º sobre trabajo temporário.
- **Lei n.º 13/2023, de 3 de abril** — "Agenda do Trabalho Digno", que introdujo modificaciones significativas al CT, incluyendo el nuevo **artículo 12.º-A** (presunción de laboralidad para plataformas digitales).

> ⚠️ **Nota importante:** La "Lei 19/2014" mencionada en la consulta no es la ley principal de trabajo temporário. La Lei n.º 19/2014 es una ley ambiental (bases de política de ambiente). El régimen de trabajo temporário está en el DL 260/2009 y en el Código do Trabalho.

### 1.2 ¿Qué es una Empresa de Trabajo Temporário (ETT)?

Según el DL 260/2009, una ETT es una empresa cuya actividad consiste en **ceder temporalmente trabajadores a otras empresas (utilizadores)**. La ETT contrata al trabajador y lo cede a un tercero. La relación es triangular:

```
ETT (empleador formal) → Trabajador → Empresa utilizadora (donde presta servicio)
```

**Requisitos para ser ETT:**
- Licencia emitida por el **IEFP** (Instituto de Emprego e Formação Profissional)
- Capital social mínimo
- Prestación de caución/garantía financiera
- Idoneidad de los administradores
- Prohibición de cobrar a los trabajadores por la colocación

### 1.3 ¿Es tu plataforma una ETT?

**Probablemente NO**, si tu modelo es:

- ✅ Conectar trabajadores independientes (autónomos) con empleadores para turnos puntuales
- ✅ Los trabajadores facturan directamente al empleador o a través de la plataforma como recibos verdes
- ✅ No hay contrato de trabajo entre la plataforma y el trabajador
- ✅ La plataforma no "cede" trabajadores — solo facilita la conexión

**Pero podrías ser considerada ETT si:**
- ❌ La plataforma contrata a los trabajadores y los cede a los clientes
- ❌ La plataforma paga salarios y luego factura al cliente
- ❌ La plataforma ejerce poder disciplinario sobre los trabajadores

### 1.4 Alternativa: Agência Privada de Colocação

El DL 260/2009 también regula las **agências privadas de colocação**. Estas solo requieren **comunicación previa al IEFP** (no licencia). Su actividad es la intermediación entre oferta y demanda de empleo, sin ser parte del contrato de trabajo.

**Para tu plataforma, esta figura es más adecuada si:**
- Solo conectas trabajadores independientes con empleadores
- No eres parte del contrato de trabajo
- Los trabajadores son autónomos (recibos verdes)

**Obligaciones de la agência de colocação:**
- Comunicación previa al IEFP (gratuita)
- Gratuidad para los trabajadores (no puedes cobrarles por buscarles trabajo)
- No discriminación en la selección
- Protección de datos conforme RGPD

---

## 2. Seguro de Responsabilidad y Accidentes

### 2.1 Marco legal

- **Lei n.º 98/2009, de 4 de setembro** — Regulamenta el régimen de reparación de accidentes de trabajo y enfermedades profesionales.
- **Artículo 3.º de la Lei 98/2009** — Establece la obligatoriedad del seguro de accidentes de trabajo para trabajadores por cuenta ajena **y también para trabajadores independientes**.
- **Decreto-Lei n.º 159/99, de 11 de maio** (modificado) — Reglamenta el seguro obligatorio de accidentes de trabajo para trabajadores independientes.

### 2.2 ¿Quién es responsable si un worker sufre un accidente?

**Depende de la relación jurídica:**

| Escenario | Responsable |
|-----------|-------------|
| Worker es **trabajador por cuenta ajena** de la plataforma/ETT | La ETT/plataforma (empleador) es responsable. Debe tener seguro de acidentes de trabalho. |
| Worker es **trabajador independiente** (recibos verdes) | **El propio trabajador** es responsable de tener su seguro. Es **obligatorio por ley** para todos los trabajadores independientes. |
| Worker independiente sufre accidente en local del cliente | El seguro del trabajador independiente cubre. El cliente podría tener responsabilidad civil si hubo negligencia en las condiciones de seguridad. |

### 2.3 Seguro obligatorio para trabajadores independientes

**SÍ, es obligatorio.** La Lei 98/2009 y el DL 159/99 establecen que todo trabajador independiente debe tener un seguro de accidentes de trabajo.

**Coberturas típicas:**
- Assistência médica, cirúrgica, farmacêutica e hospitalar
- Indemnizaciones por incapacidad temporal o permanente
- Pensões por morte (para familiares)
- Reabilitação profissional

**Coste aproximado:** Varía según la actividad y riesgo. Para actividades de bajo riesgo (limpieza, hostelería, retail), puede rondar €50-150/año.

### 2.4 Responsabilidad de la plataforma

**Si la plataforma es solo intermediaria (no empleadora):**
- La plataforma no es legalmente responsable por accidentes del trabajador independiente en el local del cliente
- **Pero** la plataforma debe asegurarse de que los workers tengan su seguro obligatorio antes de permitirles aceptar turnos
- La plataforma puede (y debería) verificar que el worker tiene seguro de acidentes de trabalho vigente

**Si la plataforma es considerada empleadora (presunción del art. 12.º-A CT):**
- La plataforma sería responsable de contratar el seguro de acidentes de trabalho para todos los workers
- Esto cambiaría radicalmente el modelo de costes

### 2.5 Recomendación práctica

- Exigir a los workers que suban su comprobante de seguro de acidentes de trabalho como requisito para activarse en la plataforma
- Incluir en los Términos y Condiciones que el worker es responsable de mantener su seguro vigente
- Considerar ofrecer un seguro colectivo como valor añadido (negociado en grupo, más barato)

---

## 3. Trabajador Independiente (Autónomo)

### 3.1 ¿Es legal exigir que los workers sean trabalhadores independentes?

**Sí, es legal**, siempre que la relación cumpla los criterios de autonomía. El trabajador independiente (recibos verdes) es una figura plenamente legal en Portugal.

**Pero hay un riesgo significativo:** La **presunción de laboralidad del art. 12.º-A del Código do Trabalho** (introducida por la Lei 13/2023 — Agenda do Trabalho Digno).

Si se cumplen **al menos 2 de estos indicadores**, se presume que existe un contrato de trabajo (la plataforma sería empleadora):

1. La plataforma **determina el pago** del servicio o establece límites mínimos/máximos
2. La plataforma ejerce **poder de dirección** (reglas sobre apariencia, conducta, desempeño)
3. La plataforma **controla y supervisa** la actividad (incluso en tiempo real, medios electrónicos o gestión algorítmica)
4. La plataforma **restringe la autonomía** del prestador (horarios, posibilidad de rechazar tareas, uso de subcontratistas, elección de clientes)
5. La plataforma ejerce **poder disciplinario** (incluyendo desactivación de cuenta)
6. Los **equipos de trabajo** pertenecen a la plataforma o son explotados por ella mediante contrato de leasing

**La presunción es rebutible (iuris tantum)** — la plataforma puede demostrar que el trabajador actúa con autonomía efectiva o que el trabajo se presta a otra entidad (intermediario).

### 3.2 Obligaciones fiscales del trabajador independiente

#### Apertura de actividad
- Debe abrir actividad en las Finanças (Portal das Finanças)
- Elegir CAE (código de actividad económica) adecuado
- Indicar estimativa de rendimientos para determinar régimen de IVA

#### IRS (Impuesto sobre la Renta)
- **Categoría B** — Rendimientos empresariales y profesionales
- **Régimen simplificado** (por defecto hasta €200.000/año):
  - Prestación de servicios (art. 151.º CIRS): tributación sobre **75%** del rendimiento bruto
  - Otras prestaciones de servicios: tributación sobre **35%** del rendimiento bruto
- **Contabilidade organizada**: obligatoria si >€200.000/año
- **Retención en la fuente:** 23% (desde 2025, antes 25%)
- **Declaración anual:** Modelo 3 + Anexo B (o Anexo C si contabilidade organizada) + Anexo SS
- **Plazo:** 1 de abril a 30 de junio de cada año

#### IVA
- **Límite de isención (art. 53.º CIVA): €15.000** de volumen de negocio anual
- **Novedad 2025 (DL 35/2025):** Si se supera el límite, se pierde la isención **en el mes siguiente** a la operación que generó el exceso (ya no se espera al año siguiente)
- Si se supera **25% del límite (€18.750)**, la factura que excede ya debe incluir IVA
- **Régimen normal trimestral:** hasta €650.000/año → declaración trimestral
- **Régimen normal mensual:** >€650.000/año → declaración mensual
- **Tasa general de IVA en Portugal:** 23% (continente), 22% (Madeira), 18% (Açores)

#### Segurança Social
- **Tasa contributiva:** 21,4% sobre el rendimento relevante
- **Rendimento relevante:** 70% del total de servicios prestados (o 20% para producción/venta de bienes y hostelería)
- **Declaración trimestral:** enero, abril, julio, octubre
- **Pago:** entre días 10 y 20 del mes siguiente a la declaración
- **Isención inicial:** primeros 12 meses de actividad (automática si no está cubierto por otro régimen)

### 3.3 Límite de facturación para no cobrar IVA

- **€15.000/año** (art. 53.º CIVA)
- Si se inicia actividad a medio año, el límite es proporcional
- Hay actividades con isención objetiva (art. 9.º CIVA) independientemente del volumen: médicos, profesores, artistas, etc.

---

## 4. Modelo de Plataforma Digital

### 4.1 Figuras legales existentes en Portugal

| Figura | Regulación | Aplica a Bee Workers? |
|--------|-----------|----------------------|
| **Empresa de Trabalho Temporário (ETT)** | DL 260/2009 | ⚠️ Solo si contrata y cede trabajadores |
| **Agência Privada de Colocação** | DL 260/2009 | ✅ Si solo conecta oferta/demanda |
| **Plataforma digital (general)** | Art. 12.º-A CT (Lei 13/2023) | ✅ Aplica a cualquier plataforma digital |
| **Operador TVDE (transporte)** | Lei 45/2018 | ❌ No aplica (solo transporte) |

### 4.2 La presunción de laboralidad (Art. 12.º-A CT)

Este es el **punto más crítico** para cualquier plataforma de intermediación laboral en Portugal. Introducido por la Lei 13/2023 (Agenda do Trabalho Digno), en vigor desde el 1 de mayo de 2023.

**Cómo funciona:**
1. Si se prueban **2 o más** de los 6 indicadores (ver sección 3.1), se **presume** que existe contrato de trabajo
2. La **carga de la prueba se invierte**: es la plataforma quien debe demostrar que NO hay relación laboral
3. La plataforma puede rebutir probando: (a) que el trabajador actúa con autonomía efectiva, o (b) que el trabajo se presta a otra entidad (intermediario)

**Primer caso judicial (febrero 2024):** El Tribunal de Trabalho de Lisboa reconoció la existencia de contrato de trabajo entre un estafeta de Uber Eats y la plataforma, basándose en la nueva presunción (se probaron 5 de los 6 indicadores).

### 4.3 Directiva Europea de Platform Work (2024/2831)

- **Adoptada:** 23 de octubre de 2024
- **En vigor:** 1 de diciembre de 2024
- **Plazo de transposición:** **2 de diciembre de 2026**
- **Elementos clave:**
  - Presunción de empleo para trabajadores de plataformas
  - Revisión humana obligatoria de decisiones algorítmicas
  - Transparencia algorítmica
  - Restricciones al procesamiento de datos personales mediante sistemas automatizados

**Portugal ya tiene el art. 12.º-A CT**, por lo que está parcialmente adelantado. Pero la Directiva va más allá en protección de datos y transparencia algorítmica. Habrá que adaptarse antes de diciembre 2026.

### 4.4 Cómo evitar ser considerado empleador

**Estrategias de mitigación (basadas en lo que han hecho plataformas como Bolt/Uber):**

1. ✅ **No fijar precios** — Permitir que los workers establezcan sus tarifas o que el mercado las determine
2. ✅ **No imponer horarios** — El worker elige cuándo y cuánto trabaja
3. ✅ **No sancionar por rechazar turnos** — Sin penalización por no aceptar trabajo
4. ✅ **Permitir subcontratación/sustitución** — El worker puede enviar a otra persona
5. ✅ **No controlar en tiempo real** — Sin GPS tracking ni supervisión de la actividad
6. ✅ **No ejercer poder disciplinario** — La desactivación de cuenta solo por incumplimiento grave de los términos (no por "rendimiento")
7. ✅ **No proporcionar equipos** — El worker usa sus propias herramientas
8. ✅ **Workers facturan directamente al cliente** — La plataforma solo cobra una comisión por conexión
9. ✅ **Contratos claros de prestación de servicios** — No llamar "contrato de trabajo"
10. ✅ **Workers con múltiples clientes** — Fomentar que trabajen para varios empleadores, no exclusividad

### 4.5 Modelo recomendado para Bee Workers

**Modelo: Plataforma de marketplace + Agência de Colocação**

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  Employer    │◄────►│  Bee Workers  │◄────►│   Worker     │
│  (cliente)   │      │  (plataforma) │      │ (autónomo)   │
└─────────────┘      └──────────────┘      └─────────────┘
     │                      │                      │
     │    Paga factura      │    Cobra comisión    │
     │    al worker         │    a ambos o a uno   │
     │                      │                      │
     └──────────────────────┴──────────────────────┘
         Relación directa: worker factura al employer
```

**Características:**
- Workers = trabalhadores independentes (recibos verdes)
- Employers = empresas que necesitan personal temporal
- Plataforma = marketplace que conecta (agência de colocação)
- La plataforma **no contrata** ni **cede** trabajadores
- La plataforma cobra una comisión por el servicio de conexión/intermediación
- Los workers facturan directamente al employer (o la plataforma actúa como mero agente de cobro)

---

## 5. KYC y Verificación de Identidad

### 5.1 Marco legal

- **Lei n.º 83/2017, de 18 de agosto** — Medidas de combate al blanqueo de capitales y financiación del terrorismo (transpone las Directivas AML europeas)
- **RGPD** — Regulamento Geral de Proteção de Dados (UE 2016/679)
- **Lei n.º 58/2019, de 8 de agosto** — Ley nacional de ejecución del RGPD en Portugal

### 5.2 ¿Aplica la Lei 83/2017 a una plataforma de intermediación laboral?

La Lei 83/2017 aplica a **entidades financieras** y **entidades no financieras** específicamente listadas (art. 4.º). Una plataforma de intermediación laboral **no está automáticamente sujeta** a los deberes de KYC/AML de la Lei 83/2017, a menos que:

- Realice actividades de pago (procesamiento de pagos entre workers y employers)
- Se considere "prestador de servicios a sociedades" o "trust"

**Sin embargo**, si la plataforma procesa pagos, podría estar sujeta a obligaciones AML. Si solo conecta y los pagos son directos, no aplica.

### 5.3 Verificación de identidad recomendada (aunque no obligatoria por AML)

Aunque no haya obligación legal AML estricta, es **altamente recomendable** verificar la identidad de los workers por:

- **Prevención de fraude** laboral y documental
- **Seguridad jurídica** de los contratos
- **Protección de los employers** (saber quién entra a su local)
- **Cumplimiento fiscal** (asegurar que el NIF es real y válido)

**Datos mínimos a verificar:**

| Dato | Obligatorio | Método de verificación |
|------|-------------|----------------------|
| **NIF** (Número de Identificação Fiscal) | ✅ Sí | Validación contra API de AT (Autoridade Tributária) o verificación del formato (9 dígitos + check digit) |
| **Documento de identificación** (Cartão de Cidadão / Passaporte / Título de Residência) | ✅ Sí | OCR + verificación de validez |
| **Selfie / prueba de vida** | ⚠️ Recomendable | Comparación biométrica con el documento |
| **Comprobante de actividad aberta nas Finanças** | ✅ Sí | Verificar que el NIF tiene actividad como trabalhador independente |
| **Comprobante de seguro de acidentes de trabalho** | ✅ Sí | Obligatorio por ley para trabajar |
| **NISS** (Número de Identificação de Segurança Social) | ⚠️ Recomendable | Para verificar registro en SS |
| **Certificado de registo criminal** | ❌ No obligatorio | Solo para sectores específicos (contacto con menores, etc.) |
| **Comprobante de morada** | ⚠️ Recomendable | Factura de servicios o contrato de arrendamiento |

### 5.4 Verificación de employers

| Dato | Obligatorio | Método |
|------|-------------|--------|
| **NIF/NIPC** (empresa) | ✅ Sí | Validación contra AT |
| **Certidão permanente** (registro comercial) | ✅ Sí | Verificar que la empresa existe y está activa |
| **Representante legal** | ✅ Sí | Documento de identificación del firmante |
| **Comprobante de seguro de acidentes de trabalho** (si tiene empleados propios) | ⚠️ Informativo | Para responsabilidad en el local |

---

## 6. Protección de Datos (GDPR/RGPD)

### 6.1 Marco legal

- **Regulamento (UE) 2016/679 (RGPD)** — Aplicable directamente en toda la UE
- **Lei n.º 58/2019, de 8 de agosto** — Ejecución nacional del RGPD en Portugal
- **CNPD** (Comissão Nacional de Proteção de Dados) — Autoridad de control portuguesa

### 6.2 Datos mínimos necesarios para la plataforma

#### Datos del Worker (trabajador independiente)

| Dato | Base legal | Finalidad | Conservación |
|------|-----------|-----------|-------------|
| Nombre completo | Ejecución contractual (art. 6.1.b RGPD) | Identificación, facturación | Duración del contrato + plazo de prescripción (10 años fiscal) |
| NIF | Obligación legal (art. 6.1.c RGPD) | Facturación, verificación fiscal | 10 años (obligación fiscal) |
| Email | Ejecución contractual | Comunicación, notificaciones | Duración del contrato + 2 años |
| Teléfono | Consentimiento (art. 6.1.a) o interés legítimo (art. 6.1.f) | Comunicación urgente, verificación | Duración del contrato + 2 años |
| Documento de identidad (copia) | Interés legítimo (art. 6.1.f) | Verificación de identidad, prevención de fraude | Duración del contrato + 1 año |
| Selfie / dato biométrico | Consentimiento explícito (art. 9.2.a RGPD) | Verificación de identidad | Solo durante el proceso de verificación; eliminar después |
| NISS | Obligación legal | Verificación SS | Duración del contrato + plazo legal |
| Datos bancarios (IBAN) | Ejecución contractual | Pagos | Duración del contrato + 10 años |
| Historial de turnos | Ejecución contractual | Operativa de la plataforma | Duración del contrato + 5 años |
| Valoraciones/ratings | Interés legítimo | Calidad del servicio | Duración del contrato + 2 años |

#### Datos del Employer (cliente)

| Dato | Base legal | Finalidad |
|------|-----------|-----------|
| Nombre empresa / NIPC | Ejecución contractual | Identificación, facturación |
| Datos de contacto | Ejecución contractual | Comunicación |
| Datos de facturación | Obligación legal | Facturación |

### 6.3 Obligaciones clave bajo el RGPD

1. **Registro de actividades de tratamiento (art. 30 RGPD):** Obligatorio documentar qué datos se tratan, con qué finalidad, base legal, plazos de conservación y medidas de seguridad.

2. **Consentimiento (art. 7 RGPD):** Debe ser libre, específico, informado e inequívoco. No sirve el consentimiento tácito. Para datos biométricos (selfie), se requiere consentimiento **explícito** (art. 9.2.a).

3. **Privacy Policy:** Debe estar disponible en portugués, ser clara y accesible. Debe incluir:
   - Identidad del responsable del tratamiento
   - Datos recogidos y finalidad
   - Base legal del tratamiento
   - Plazos de conservación
   - Derechos del titular (acceso, rectificación, supresión, portabilidad, oposición)
   - Derecho a reclamar ante la CNPD

4. **Data Protection Impact Assessment (DPIA):** Recomendable realizar una evaluación de impacto (art. 35 RGPD) dado que se tratan datos biométricos y datos a gran escala.

5. **Data Protection Officer (DPO):** No es obligatorio para una startup pequeña, pero sí recomendable designar un responsable de protección de datos.

6. **Medidas de seguridad (art. 32 RGPD):**
   - Cifrado de datos en tránsito (TLS 1.3) y en reposo (AES-256)
   - Control de acceso basado en roles (RBAC)
   - Autenticación de dos factores (2FA) para administradores
   - Registro de accesos (logs)
   - Copias de seguridad cifradas
   - Procedimiento de notificación de brechas de seguridad (72h a CNPD)

7. **Transferencias internacionales:** Si usas servidores fuera de la UE (AWS, Google Cloud), necesitas garantías adecuadas (cláusulas contractuales tipo, Privacy Shield, etc.).

8. **Derechos de los titulares:**
   - Derecho de acceso (art. 15)
   - Derecho de rectificación (art. 16)
   - Derecho de supresión (art. 17)
   - Derecho a la portabilidad (art. 20)
   - Derecho de oposición (art. 21)

### 6.4 Almacenamiento de datos

- **Servidores en la UE/EEE** (recomendado) o con garantías adecuadas
- **Cifrado en reposo** (AES-256)
- **Cifrado en tránsito** (TLS 1.3)
- **Separación lógica** de datos de workers y employers
- **Política de retención** clara con eliminación automática
- **Backups cifrados** con retención limitada

---

## 7. Resumen Ejecutivo y Recomendaciones

### 7.1 Checklist legal para Bee Workers

| # | Requisito | Prioridad | Estado |
|---|----------|-----------|--------|
| 1 | Registrar la plataforma como **Agência Privada de Colocação** (comunicación previa al IEFP) | 🔴 ALTA | Pendiente |
| 2 | Diseñar el modelo para **evitar la presunción de laboralidad** (art. 12.º-A CT) | 🔴 ALTA | Pendiente |
| 3 | Exigir a los workers: **actividad aberta nas Finanças** (recibos verdes) | 🔴 ALTA | Pendiente |
| 4 | Exigir a los workers: **seguro de acidentes de trabalho** vigente | 🔴 ALTA | Pendiente |
| 5 | Verificar **NIF + documento de identidad** de cada worker | 🟡 MEDIA | Pendiente |
| 6 | Implementar **Privacy Policy + RGPD compliance** | 🔴 ALTA | Pendiente |
| 7 | Realizar **DPIA** (Data Protection Impact Assessment) | 🟡 MEDIA | Pendiente |
| 8 | Prepararse para la **Directiva UE 2024/2831** (transposición dic 2026) | 🟢 BAJA | Monitorizar |
| 9 | Términos y Condiciones claros (portugués + inglés) | 🔴 ALTA | Pendiente |
| 10 | Contrato de prestación de servicios entre plataforma y worker | 🔴 ALTA | Pendiente |

### 7.2 Riesgos legales principales

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| **Reclasificación laboral** (plataforma considerada empleadora) | Media-Alta | Muy Alto | Diseñar modelo con máxima autonomía del worker; evitar ≥2 indicadores del art. 12.º-A |
| **Falta de licencia ETT** (si se considera cesión de trabajadores) | Media | Alto | Operar como agência de colocação, no como ETT |
| **Incumplimiento RGPD** | Media | Alto | Implementar compliance desde el día 1; DPIA |
| **Worker sin seguro de acidentes** | Alta | Medio | Verificación obligatoria antes de activar perfil |
| **Worker sin actividad aberta** | Alta | Medio | Verificación obligatoria; solo workers con CAE adecuado |
| **Responsabilidad por accidentes** | Media | Alto | Términos claros + verificación de seguro del worker |

### 7.3 Próximos pasos recomendados

1. **Contratar asesoría legal portuguesa** especializada en derecho laboral y plataformas digitales (bufetes recomendados: Morais Leitão, PLMJ, Cuatrecasas, Vieira de Almeida)
2. **Registrar la comunicación previa en el IEFP** como Agência Privada de Colocação
3. **Diseñar los Términos y Condiciones** con foco en autonomía del worker
4. **Implementar el flujo de verificación** (NIF + documento + actividad + seguro)
5. **Desarrollar la Privacy Policy** y documentación RGPD
6. **Monitorizar la transposición** de la Directiva UE 2024/2831 en Portugal

### 7.4 Fuentes consultadas

- Código do Trabalho (Lei 7/2009, actualizado por Lei 13/2023)
- Decreto-Lei 260/2009 (Agências de Colocação e ETT)
- Lei 98/2009 (Acidentes de Trabalho)
- Lei 83/2017 (Branqueamento de Capitais)
- Código do IVA (CIVA), art. 53.º
- Código do IRS (CIRS), Categoria B
- RGPD (Regulamento UE 2016/679) + Lei 58/2019
- Directiva (UE) 2024/2831 (Platform Work)
- Lei 45/2018 (TVDE / "Uber Law")
- Portal das Finanças (portaldasfinancas.gov.pt)
- Segurança Social (seg-social.pt)
- IEFP (iefp.pt)
- ACT (Autoridade para as Condições do Trabalho)
- CNPD (Comissão Nacional de Proteção de Dados)
- Wolters Kluwer — "An employment presumption for platform work – the Portuguese experience"
- Morais Leitão — "Agenda do Trabalho Digno: principais alterações"

---

*Este documento es un análisis preliminar basado en fuentes públicas. No constituye asesoramiento legal formal. Se recomienda validar todas las conclusiones con un abogado portugués especializado en derecho laboral y plataformas digitales antes de lanzar la plataforma.*
