/*
 * NT8HydraX.cs — NinjaTrader 8 Add-On
 * 
 * Abre un servidor TCP en localhost:5555 directamente dentro de NT8.
 * Recibe comandos JSON y ejecuta operaciones usando la API interna de NT8.
 * 
 * INSTALACION:
 *   1. Copia este archivo a: Documents\NinjaTrader 8\bin\Custom\AddOns\
 *   2. En NT8: New > NinjaScript Editor > Compile (F5)
 *   3. El add-on se carga automaticamente. Veras "HydraX: X accounts" en el log.
 */

#region Using declarations
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.AddOns;
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
    public class NT8HydraX : AddOnBase
    {
        private TcpListener _server;
        private Thread _serverThread;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "NT8HydraX";
                IsConfigured = true;
            }
            else if (State == State.Terminated)
            {
                _server?.Stop();
            }
        }

        protected override void OnWindowCreated()
        {
            // Check if we have accounts
            if (Account.All.Count == 0)
            {
                Log("HydraX: No trading accounts found in NT8. Add accounts in the Accounts tab.", LogLevel.Warning);
                return;
            }

            Log($"HydraX: {Account.All.Count()} accounts available on port 5555", LogLevel.Information);
            foreach (var a in Account.All)
                Log($"  - {a.Name} (Balance: {a.Get(AccountItem.CashValue, Currency.UsDollar):F2})", LogLevel.Information);

            _serverThread = new Thread(StartServer)
            {
                IsBackground = true,
                Name = "HydraX-Server"
            };
            _serverThread.Start();
        }

        protected override void OnWindowDestroyed()
        {
            _server?.Stop();
            Log("HydraX: Server stopped", LogLevel.Information);
        }

        private void StartServer()
        {
            try
            {
                _server = new TcpListener(IPAddress.Loopback, 5555);
                _server.Start();
                Log("HydraX: TCP server started on port 5555", LogLevel.Information);

                while (_server != null)
                {
                    var client = _server.AcceptTcpClient();
                    var t = new Thread(() => HandleClient(client))
                    {
                        IsBackground = true,
                        Name = "HydraX-Client"
                    };
                    t.Start();
                }
            }
            catch (SocketException)
            {
                // Server stopped
            }
            catch (Exception ex)
            {
                Log($"HydraX: Server error: {ex.Message}", LogLevel.Error);
            }
        }

        private void HandleClient(TcpClient client)
        {
            using (client)
            using (var stream = client.GetStream())
            using (var reader = new StreamReader(stream, Encoding.UTF8))
            using (var writer = new StreamWriter(stream, Encoding.UTF8) { AutoFlush = true, NewLine = "\n" })
            {
                try
                {
                    var line = reader.ReadLine();
                    if (string.IsNullOrEmpty(line)) return;

                    var cmd = JsonDocument.Parse(line).RootElement;
                    var action = cmd.GetProperty("action").GetString();
                    var response = "{}";

                    switch (action)
                    {
                        case "ACCOUNT": response = GetAccountInfo(cmd); break;
                        case "POSITIONS": response = GetPositions(cmd); break;
                        case "OPEN": response = OpenPosition(cmd); break;
                        case "CLOSE": response = ClosePosition(cmd); break;
                    }

                    writer.WriteLine(response);
                }
                catch (Exception ex)
                {
                    Log($"HydraX: Client error: {ex.Message}", LogLevel.Warning);
                }
            }
        }

        private Account GetAccount(JsonElement cmd)
        {
            if (cmd.TryGetProperty("account", out var accName))
                return Account.All.FirstOrDefault(a => a.Name.Equals(accName.GetString(), StringComparison.OrdinalIgnoreCase));
            return Account.All.FirstOrDefault();
        }

        private string GetAccountInfo(JsonElement cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null)
                return $"{{\"ok\":false,\"error\":\"Account not found. Available: {string.Join(", ", Account.All.Select(a => a.Name))}\"}}";

            try
            {
                double balance = acc.Get(AccountItem.CashValue, Currency.UsDollar);
                double equity = acc.Get(AccountItem.CashValue, Currency.UsDollar);
                double pnl = acc.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar);
                int positions = acc.Positions.Count(p => p.Quantity != 0);

                return JsonSerializer.Serialize(new
                {
                    ok = true,
                    name = acc.Name,
                    balance,
                    equity,
                    pnl,
                    positions,
                });
            }
            catch (Exception ex)
            {
                return $"{{\"ok\":true,\"name\":\"{acc.Name}\",\"error\":\"{ex.Message}\"}}";
            }
        }

        private string GetPositions(JsonElement cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"Account not found\"}";

            var posList = acc.Positions
                .Where(p => p.Quantity != 0)
                .Select(p => new
                {
                    symbol = p.Instrument.FullName,
                    direction = p.MarketPosition == MarketPosition.Long ? "BUY" : "SELL",
                    contracts = Math.Abs(p.Quantity),
                    entry_price = p.AveragePrice,
                    pnl = acc.Get(AccountItem.UnrealizedProfitLoss, Currency.UsDollar),
                    id = $"{p.Instrument.FullName}_{p.AveragePrice}_{DateTime.Now.Ticks}",
                }).ToList();

            return JsonSerializer.Serialize(new { ok = true, positions = posList });
        }

        private string OpenPosition(JsonElement cmd)
        {
            try
            {
                var acc = GetAccount(cmd);
                if (acc == null)
                    return $"{{\"ok\":false,\"error\":\"Account not found\"}}";

                string symbol = cmd.GetProperty("symbol").GetString();
                int contracts = cmd.GetProperty("contracts").GetInt32();
                string direction = cmd.GetProperty("direction").GetString();
                double sl = cmd.TryGetProperty("sl", out var s) && s.ValueKind != JsonValueKind.Null ? s.GetDouble() : 0;
                double tp = cmd.TryGetProperty("tp", out var t) && t.ValueKind != JsonValueKind.Null ? t.GetDouble() : 0;

                var instrument = Instrument.GetInstrument(symbol);
                if (instrument == null)
                    return $"{{\"ok\":false,\"error\":\"Symbol '{symbol}' not found in NT8 instrument list\"}}";

                var orderAction = direction.Equals("BUY", StringComparison.OrdinalIgnoreCase)
                    ? OrderAction.Buy : OrderAction.Sell;

                // Submit market order
                acc.CreateOrder(
                    instrument,
                    OrderType.Market,
                    orderAction,
                    OrderType.Market,
                    contracts,
                    0, 0,
                    string.Empty,
                    "HydraX",
                    null
                );

                // Set SL/TP if needed - requires separate orders after fill
                Log($"HydraX: OPEN {direction} {contracts}x {symbol} on {acc.Name}", LogLevel.Information);

                return $"{{\"ok\":true,\"position_id\":\"{symbol}_{DateTime.Now.Ticks}\",\"symbol\":\"{symbol}\",\"contracts\":{contracts}}}";
            }
            catch (Exception ex)
            {
                Log($"HydraX: OPEN error: {ex.Message}", LogLevel.Error);
                return $"{{\"ok\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private string ClosePosition(JsonElement cmd)
        {
            try
            {
                var acc = GetAccount(cmd);
                if (acc == null) return "{\"ok\":false,\"error\":\"Account not found\"}";

                string symbol = null;
                if (cmd.TryGetProperty("symbol", out var s))
                    symbol = s.GetString();

                var positions = acc.Positions.Where(p => p.Quantity != 0);
                if (!string.IsNullOrEmpty(symbol))
                    positions = positions.Where(p => p.Instrument.FullName == symbol);

                int closed = 0;
                foreach (var pos in positions.ToList())
                {
                    acc.CreateOrder(
                        pos.Instrument,
                        OrderType.Market,
                        pos.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy,
                        OrderType.Market,
                        Math.Abs(pos.Quantity),
                        0, 0,
                        string.Empty,
                        "HydraX Close",
                        null
                    );
                    closed++;
                }

                return $"{{\"ok\":true,\"closed\":{closed}}}";
            }
            catch (Exception ex)
            {
                return $"{{\"ok\":false,\"error\":\"{ex.Message}\"}}";
            }
        }
    }
}
