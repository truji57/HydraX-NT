/*
 * NT8Bridge.cs — NinjaTrader 8 Add-On Bridge
 * 
 * Abre un servidor TCP en localhost:5555 y recibe comandos JSON
 * para ejecutar operaciones en NinjaTrader 8.
 * 
 * Compilar: Visual Studio / dotnet build
 * Instalar: Copiar NT8Bridge.dll a Documents/NinjaTrader 8/bin/Custom/
 */

using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.AddOns;

namespace HydraXNT
{
    public class NT8Bridge : AddOnBase
    {
        private TcpListener _server;
        private bool _running = true;

        protected override void OnWindowCreated()
        {
            Log($"HydraX-NT: {Account.All.Count()} accounts available", LogLevel.Information);
            foreach (var a in Account.All)
                Log($"  - {a.Name} ({a.Provider})", LogLevel.Information);
            Task.Run(() => StartServer());
        }

        private async Task StartServer()
        {
            _server = new TcpListener(IPAddress.Loopback, 5555);
            _server.Start();
            Log("HydraX-NT: Bridge started on port 5555", LogLevel.Information);

            while (_running)
            {
                try
                {
                    var client = await _server.AcceptTcpClientAsync();
                    _ = Task.Run(() => HandleClient(client));
                }
                catch (Exception ex)
                {
                    Log($"HydraX-NT: Server error: {ex.Message}", LogLevel.Error);
                }
            }
        }

        private async Task HandleClient(TcpClient client)
        {
            using (client)
            using (var stream = client.GetStream())
            using (var reader = new StreamReader(stream, Encoding.UTF8))
            using (var writer = new StreamWriter(stream, Encoding.UTF8) { AutoFlush = true })
            {
                try
                {
                    var line = await reader.ReadLineAsync();
                    if (string.IsNullOrEmpty(line)) return;

                    var cmd = JsonSerializer.Deserialize<JsonElement>(line);
                    var action = cmd.GetProperty("action").GetString();
                    var response = "{}";

                    switch (action)
                    {
                        case "ACCOUNT":
                            response = GetAccountInfo(cmd);
                            break;
                        case "POSITIONS":
                            response = GetPositions(cmd);
                            break;
                        case "OPEN":
                            response = OpenPosition(cmd);
                            break;
                        case "CLOSE":
                            response = ClosePosition(cmd);
                            break;
                        case "MODIFY":
                            response = ModifyPosition(cmd);
                            break;
                    }

                    await writer.WriteLineAsync(response);
                }
                catch (Exception ex)
                {
                    Log($"HydraX-NT: Client error: {ex.Message}", LogLevel.Error);
                }
            }
        }

        private string GetAccountInfo()
        {
            if (_account == null) return "{\"ok\":false,\"error\":\"No account\"}";
            var info = _account.Get(AccountItem.CashValue, Currency.UsDollar);
            return $"{{\"ok\":true,\"balance\":{_account.Get(AccountItem.CashValue, Currency.UsDollar)},\"equity\":{_account.Get(AccountItem.CashValue, Currency.UsDollar)}}}";
        }

        private string GetPositions()
        {
            var positions = _account.Positions.Where(p => p.Quantity != 0).Select(p => new
            {
                id = p.AveragePrice + "_" + p.Instrument.FullName + "_" + DateTime.Now.Ticks,
                symbol = p.Instrument.FullName,
                direction = p.MarketPosition == MarketPosition.Long ? "BUY" : "SELL",
                contracts = Math.Abs(p.Quantity),
                entry_price = (double)p.AveragePrice,
                sl = 0.0,
                tp = 0.0,
            }).ToList();

            return JsonSerializer.Serialize(new { ok = true, positions });
        }

        private string OpenPosition(JsonElement cmd)
        {
            try
            {
                var symbol = cmd.GetProperty("symbol").GetString();
                var contracts = cmd.GetProperty("contracts").GetInt32();
                var direction = cmd.GetProperty("direction").GetString();
                var sl = cmd.TryGetProperty("sl", out var slEl) && slEl.ValueKind != JsonValueKind.Null ? slEl.GetDouble() : 0;
                var tp = cmd.TryGetProperty("tp", out var tpEl) && tpEl.ValueKind != JsonValueKind.Null ? tpEl.GetDouble() : 0;

                var instrument = Instrument.GetInstrument(symbol);
                if (instrument == null)
                    return "{\"ok\":false,\"error\":\"Symbol not found\"}";

                var orderAction = direction.ToUpper() == "BUY" ? OrderAction.Buy : OrderAction.Sell;
                var quantity = contracts;

                _account.CreateOrder(
                    instrument,
                    orderAction == OrderAction.Buy ? OrderType.Market : OrderType.Market,
                    orderAction == OrderAction.Buy ? OrderAction.Buy : OrderAction.Sell,
                    OrderType.Market,
                    quantity,
                    0, 0,
                    string.Empty,
                    "HydraX-NT",
                    null,
                    null,
                    null
                );

                return $"{{\"ok\":true,\"position_id\":\"{instrument.FullName}_{DateTime.Now.Ticks}\"}}";
            }
            catch (Exception ex)
            {
                return $"{{\"ok\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private string ClosePosition(JsonElement cmd)
        {
            try
            {
                var positionId = cmd.GetProperty("position_id").GetString();
                var parts = positionId.Split('_');
                if (parts.Length < 2) return "{\"ok\":false,\"error\":\"Invalid position_id\"}";
                var symbol = parts[1];

                var pos = _account.Positions.FirstOrDefault(p => p.Instrument.FullName == symbol && p.Quantity != 0);
                if (pos == null) return "{\"ok\":false,\"error\":\"Position not found\"}";

                _account.CreateOrder(
                    pos.Instrument,
                    pos.MarketPosition == MarketPosition.Long ? OrderType.Market : OrderType.Market,
                    pos.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy,
                    OrderType.Market,
                    Math.Abs(pos.Quantity),
                    0, 0,
                    string.Empty,
                    "HydraX-NT Close",
                    null,
                    null,
                    null
                );

                return "{\"ok\":true}";
            }
            catch (Exception ex)
            {
                return $"{{\"ok\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private string ModifyPosition(JsonElement cmd)
        {
            return "{\"ok\":false,\"error\":\"SL/TP modify not supported via this bridge yet\"}";
        }

        protected override void OnWindowDestroyed()
        {
            _running = false;
            _server?.Stop();
            Log("HydraX-NT: Bridge stopped", LogLevel.Information);
        }
    }
}
