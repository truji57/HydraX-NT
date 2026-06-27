/*
 * NT8HydraX.cs — NinjaTrader 8 Add-On (compatible .NET Framework 4.8)
 * 
 * Servidor TCP en localhost:5555 que recibe JSON y ejecuta en NT8.
 * 
 * INSTALAR:
 *   1. Copiar a Documents\NinjaTrader 8\bin\Custom\AddOns\
 *   2. NT8 > New > NinjaScript Editor > F5 (Compile)
 *   3. Reiniciar NT8
 */

#region Using declarations
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
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
            }
            else if (State == State.Terminated)
            {
                try { _server?.Stop(); }
                catch { }
            }
        }

        protected override void OnWindowCreated()
        {
            if (Account.All.Count == 0)
            {
                Log("HydraX: No accounts found", LogLevel.Warning);
                return;
            }

            Log($"HydraX: {Account.All.Count()} accounts on port 5555", LogLevel.Information);
            foreach (var a in Account.All)
            {
                try
                {
                    double bal = a.Get(AccountItem.CashValue, Currency.UsDollar);
                    Log($"  {a.Name} (Balance: {bal:F2})", LogLevel.Information);
                }
                catch { }
            }

            _serverThread = new Thread(StartServer) { IsBackground = true, Name = "HydraX" };
            _serverThread.Start();
        }

        private void StartServer()
        {
            try
            {
                _server = new TcpListener(IPAddress.Loopback, 5555);
                _server.Start();
                Log("HydraX: TCP ready on :5555", LogLevel.Information);

                while (_server != null)
                {
                    try
                    {
                        var client = _server.AcceptTcpClient();
                        new Thread(() => HandleClient(client)) { IsBackground = true }.Start();
                    }
                    catch { break; }
                }
            }
            catch (Exception ex)
            {
                Log($"HydraX: Error: {ex.Message}", LogLevel.Error);
            }
        }

        private void HandleClient(TcpClient client)
        {
            using (client)
            using (var stream = client.GetStream())
            {
                var reader = new StreamReader(stream, Encoding.UTF8);
                var writer = new StreamWriter(stream, Encoding.UTF8) { AutoFlush = true, NewLine = "\n" };
                try
                {
                    string line = reader.ReadLine();
                    if (string.IsNullOrEmpty(line)) return;

                    JObject cmd = JObject.Parse(line);
                    string action = (string)cmd["action"];
                    string response = "{}";

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
                    Log($"HydraX: {ex.Message}", LogLevel.Warning);
                }
            }
        }

        private Account GetAccount(JObject cmd)
        {
            string accName = (string)cmd["account"];
            if (!string.IsNullOrEmpty(accName))
                return Account.All.FirstOrDefault(a => a.Name == accName);
            return Account.All.FirstOrDefault();
        }

        private string GetAccountInfo(JObject cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null)
                return "{\"ok\":false,\"error\":\"No account\"}";

            try
            {
                var result = new JObject
                {
                    ["ok"] = true,
                    ["name"] = acc.Name,
                    ["balance"] = acc.Get(AccountItem.CashValue, Currency.UsDollar),
                    ["positions"] = acc.Positions.Count(p => p.Quantity != 0),
                };
                return result.ToString(Formatting.None);
            }
            catch (Exception ex)
            {
                return $"{{\"ok\":true,\"name\":\"{acc.Name}\",\"error\":\"{ex.Message}\"}}";
            }
        }

        private string GetPositions(JObject cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"No account\"}";

            var list = new JArray();
            foreach (var p in acc.Positions.Where(p => p.Quantity != 0))
            {
                list.Add(new JObject
                {
                    ["symbol"] = p.Instrument.FullName,
                    ["direction"] = p.MarketPosition == MarketPosition.Long ? "BUY" : "SELL",
                    ["contracts"] = Math.Abs(p.Quantity),
                    ["entry_price"] = p.AveragePrice,
                    ["id"] = $"{p.Instrument.FullName}_{p.AveragePrice}_{DateTime.Now.Ticks}",
                });
            }

            var result = new JObject { ["ok"] = true, ["positions"] = list };
            return result.ToString(Formatting.None);
        }

        private string OpenPosition(JObject cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"No account\"}";

            try
            {
                string symbol = (string)cmd["symbol"];
                int contracts = (int)cmd["contracts"];
                string direction = ((string)cmd["direction"]).ToUpper();

                var instrument = Instrument.GetInstrument(symbol);
                if (instrument == null)
                    return $"{{\"ok\":false,\"error\":\"Symbol '{symbol}' not found\"}}";

                var orderAction = direction == "BUY" ? OrderAction.Buy : OrderAction.Sell;

                acc.CreateOrder(
                    instrument,
                    orderAction,
                    OrderType.Market,
                    TimeInForce.Day,
                    contracts,
                    0,
                    0,
                    string.Empty,
                    "HydraX",
                    null
                );

                Log($"HydraX: {direction} {contracts}x {symbol} on {acc.Name}", LogLevel.Information);
                return $"{{\"ok\":true,\"position_id\":\"{symbol}_{DateTime.Now.Ticks}\"}}";
            }
            catch (Exception ex)
            {
                Log($"HydraX: OPEN error: {ex.Message}", LogLevel.Error);
                return $"{{\"ok\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private string ClosePosition(JObject cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"No account\"}";

            try
            {
                string symbol = (string)cmd["symbol"];
                int closed = 0;

                var positions = acc.Positions.Where(p => p.Quantity != 0);
                if (!string.IsNullOrEmpty(symbol))
                    positions = positions.Where(p => p.Instrument.FullName == symbol);

                foreach (var pos in positions.ToList())
                {
                    var orderAction = pos.MarketPosition == MarketPosition.Long
                        ? OrderAction.Sell : OrderAction.Buy;

                    acc.CreateOrder(
                        pos.Instrument,
                        orderAction,
                        OrderType.Market,
                        TimeInForce.Day,
                        Math.Abs(pos.Quantity),
                        0,
                        0,
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
