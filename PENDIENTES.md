# HydraX-NT — Estado del Proyecto

## ✅ Completado

- [x] Backend FastAPI + SQLite + WebSockets (:8005)
- [x] NinjaScript NT8HydraX.cs (AddOn TCP en :5555 dentro de NT8)
- [x] Conector TCP Python (nt8_connector.py) — comunicación con el AddOn
- [x] Master monitor — detección de posiciones, órdenes pendientes, modificaciones SL/TP
- [x] Slave executor — OPEN/CLOSE/MODIFY con `EnterLong`/`EnterShort` + `account.Submit()`
- [x] SL/TP como órdenes separadas (StopMarket + Limit) según dirección
- [x] Cancelación de SL/TP al cerrar posición
- [x] Modificaciones SL/TP detectadas y copiadas
- [x] Recarga de config en caliente (reload_config)
- [x] Risk calculator para contratos (FIXED, RISK_PERCENT, RISK_USD, RATIO, BALANCE_PROP)
- [x] Multiplicador decimal (0.5 = mitad de contratos)
- [x] Emergency Close por slave
- [x] Historial persistente (trade_log)
- [x] Eventos en tiempo real vía WebSocket (OPEN, CLOSE, MODIFY, PEND, OK, FAIL)
- [x] Dashboard con tarjetas de cuentas y eventos
- [x] Gestión de cuentas (CRUD) con bridge_host/bridge_port
- [x] Configuración de slaves (modo riesgo, contratos, toggles, magic number)
- [x] Backup / Restore (export/import JSON)
- [x] Magic number como Signal Name
- [x] Versión dinámica desde git tags
- [x] Repo GitHub: https://github.com/truji57/HydraX-NT
- [x] 1 sola instancia de NT8 para todas las cuentas

## 🔴 Pendientes (próxima sesión)

- [ ] Auto-reinicio de workers muertos en el orchestrator
- [ ] Reconciliación automática al iniciar (llamar /sync)
- [ ] Tests con cuentas live (no solo Sim)
- [ ] Soporte para múltiples instrumentos simultáneos
- [ ] Mejorar la UI de eventos (filtros, búsqueda)
- [ ] Notificaciones (Telegram/Email)

## 🔵 Ideas futuro

- [ ] Gráfico P&L en tiempo real
- [ ] Soporte para brackets OCO nativos de NT8
- [ ] Modo "paper trading" (simular sin ejecutar)

## 🏗️ Arquitectura

```
HydraX-NT (Python :8005) ──TCP──→ NT8HydraX.cs (C# NinjaScript :5555) ──→ NinjaTrader 8
     │                                    │
     ├── Master Monitor (polling)         ├── Account.Get()
     ├── Slave Executor (trading)         ├── Account.CreateOrder()
     ├── Risk Calculator                  ├── Account.Submit()
     ├── Ticket Mapper (DB)               ├── Account.Cancel()
     └── WebSocket → Frontend React        └── Instrument.GetInstrument()
```

## 🚀 Arranque

1. NT8 abierto con NT8HydraX.cs compilado (F5)
2. Doble click en `start.bat` → backend :8005 + frontend :5173
3. http://localhost:5173 → STOP → RUN
