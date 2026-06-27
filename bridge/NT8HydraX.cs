#region Using declarations
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
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
        private JavaScriptSerializer _json = new JavaScriptSerializer();

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "NT8HydraX";
            }
            else if (State == State.Configure)
            {
                // Accounts might not be loaded yet - use timer to retry
                var timer = new System.Timers.Timer(2000);
                timer.Elapsed += (sender, args) =>
                {
                    if (_server == null && Account.All.Count > 0)
                    {
                        timer.Stop();
                        timer.Dispose();
                        StartServer();
                    }
                };
                timer.AutoReset = true;
                timer.Start();
                Log("HydraX: Waiting for accounts...", LogLevel.Information);
            }
            else if (State == State.Terminated)
            {
                try { _server?.Stop(); }
                catch { }
            }
        }

        private void StartServer()
        {
            if (_server != null) return;

            if (Account.All.Count == 0)
            {
                Log("HydraX: No accounts found", LogLevel.Warning);
                return;
            }

            Log("HydraX: " + Account.All.Count() + " accounts on port 5555", LogLevel.Information);
            foreach (var a in Account.All)
            {
                try
                {
                    double bal = a.Get(AccountItem.CashValue, Currency.UsDollar);
                    Log("  " + a.Name + " (Balance: " + bal.ToString("F2") + ")", LogLevel.Information);
                }
                catch { }
            }

            _serverThread = new Thread(RunServer) { IsBackground = true, Name = "HydraX" };
            _serverThread.Start();
        }

        private void RunServer()
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
                Log("HydraX Error: " + ex.Message, LogLevel.Error);
            }
        }

        private void HandleClient(TcpClient client)
        {
            using (client)
            using (var stream = client.GetStream())
            {
                var reader = new StreamReader(stream, new UTF8Encoding(false));
                var writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };
                try
                {
                    string line = reader.ReadLine();
                    if (string.IsNullOrEmpty(line)) return;

                    var cmd = _json.Deserialize<Dictionary<string, object>>(line);
                    string action = cmd.ContainsKey("action") ? cmd["action"].ToString() : "";
                    string response = "{}";

                    if (action == "ACCOUNT") response = GetAccountInfo(cmd);
                    else if (action == "POSITIONS") response = GetPositions(cmd);
                    else if (action == "ORDERS") response = GetOrders(cmd);
                    else if (action == "OPEN") response = OpenPosition(cmd);
                    else if (action == "CLOSE") response = ClosePosition(cmd);

                    writer.WriteLine(response);
                }
                catch (Exception ex)
                {
                    Log("HydraX: " + ex.Message, LogLevel.Warning);
                }
            }
        }

        private Account GetAccount(Dictionary<string, object> cmd)
        {
            if (cmd.ContainsKey("account"))
            {
                string name = cmd["account"].ToString();
                return Account.All.FirstOrDefault(a => a.Name == name);
            }
            return Account.All.FirstOrDefault();
        }

        private string GetAccountInfo(Dictionary<string, object> cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"No account\"}";

            try
            {
                var data = new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["name"] = acc.Name,
                    ["balance"] = acc.Get(AccountItem.CashValue, Currency.UsDollar),
                    ["positions"] = acc.Positions.Count(p => p.Quantity != 0),
                };
                return _json.Serialize(data);
            }
            catch
            {
                return "{\"ok\":true,\"name\":\"" + acc.Name + "\"}";
            }
        }

        private string GetOrders(Dictionary<string, object> cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"No account\"}";

            var list = new List<Dictionary<string, object>>();
            foreach (var o in acc.Orders.Where(o => o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted))
            {
                string otype = o.OrderType == OrderType.StopMarket ? "STOP" :
                               o.OrderType == OrderType.Limit ? "LIMIT" :
                               o.OrderType == OrderType.StopLimit ? "STOP_LIMIT" : "OTHER";
                list.Add(new Dictionary<string, object>
                {
                    ["ticket"] = o.Id,
                    ["symbol"] = o.Instrument.FullName,
                    ["type"] = otype,
                    ["direction"] = o.OrderAction == OrderAction.Buy ? "BUY" : "SELL",
                    ["quantity"] = o.Quantity,
                    ["limit_price"] = o.LimitPrice,
                    ["stop_price"] = o.StopPrice,
                    ["state"] = o.OrderState.ToString(),
                });
            }

            var result = new Dictionary<string, object> { ["ok"] = true, ["orders"] = list };
            return _json.Serialize(result);
        }
        private string GetPositions(Dictionary<string, object> cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"No account\"}";

            var list = new List<Dictionary<string, object>>();
            foreach (var p in acc.Positions.Where(p => p.Quantity != 0))
            {
                // Find attached SL/TP orders
                double sl = 0, tp = 0;
                foreach (var o in acc.Orders.Where(o => o.Instrument == p.Instrument &&
                    (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted)))
                {
                    if (o.OrderType == OrderType.StopMarket && o.StopPrice > 0)
                    {
                        if ((p.MarketPosition == MarketPosition.Long && o.OrderAction == OrderAction.Sell) ||
                            (p.MarketPosition == MarketPosition.Short && o.OrderAction == OrderAction.Buy))
                            sl = o.StopPrice;
                    }
                    if (o.OrderType == OrderType.Limit && o.LimitPrice > 0)
                    {
                        if ((p.MarketPosition == MarketPosition.Long && o.OrderAction == OrderAction.Sell) ||
                            (p.MarketPosition == MarketPosition.Short && o.OrderAction == OrderAction.Buy))
                            tp = o.LimitPrice;
                    }
                }

                list.Add(new Dictionary<string, object>
                {
                    ["symbol"] = p.Instrument.FullName,
                    ["direction"] = p.MarketPosition == MarketPosition.Long ? "BUY" : "SELL",
                    ["contracts"] = Math.Abs(p.Quantity),
                    ["entry_price"] = p.AveragePrice,
                    ["sl"] = sl,
                    ["tp"] = tp,
                    ["id"] = acc.Name + "_" + p.Instrument.FullName + "_" + p.AveragePrice.ToString("F0"),
                });
            }

            var result = new Dictionary<string, object> { ["ok"] = true, ["positions"] = list };
            return _json.Serialize(result);
        }

        private string OpenPosition(Dictionary<string, object> cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"No account\"}";

            try
            {
                string symbol = cmd["symbol"].ToString();
                int contracts = Convert.ToInt32(cmd["contracts"]);
                string direction = cmd["direction"].ToString().ToUpper();

                var instrument = Instrument.GetInstrument(symbol);
                if (instrument == null)
                    return "{\"ok\":false,\"error\":\"Symbol not found: " + symbol + "\"}";

                var orderAction = direction == "BUY" ? OrderAction.Buy : OrderAction.Sell;
                string magic = cmd.ContainsKey("magic") ? cmd["magic"].ToString() : "0";

                var order = acc.CreateOrder(
                    instrument,
                    orderAction,
                    OrderType.Market,
                    TimeInForce.Gtc,
                    contracts,
                    0, 0, "", "HydraX-" + magic, null
                );

                if (order == null)
                    return "{\"ok\":false,\"error\":\"CreateOrder returned null\"}";

                acc.Submit(new[] { order });

                // Esperar a que se ejecute
                for (int i = 0; i < 50; i++)
                {
                    if (order.OrderState == OrderState.Filled ||
                        order.OrderState == OrderState.PartFilled ||
                        order.OrderState == OrderState.Rejected ||
                        order.OrderState == OrderState.Cancelled)
                        break;
                    System.Threading.Thread.Sleep(100);
                }

                Log("HydraX: " + direction + " " + contracts + "x " + symbol + " on " + acc.Name +
                    " - OrderState=" + order.OrderState, LogLevel.Information);

                // SL/TP as separate orders (NT8 futures style)
                double sl = cmd.ContainsKey("sl") ? Convert.ToDouble(cmd["sl"]) : 0;
                double tp = cmd.ContainsKey("tp") ? Convert.ToDouble(cmd["tp"]) : 0;

                if (order.OrderState == OrderState.Filled || order.OrderState == OrderState.PartFilled)
                {
                    if (sl > 0)
                    {
                        // For BUY: SL is a Sell Stop. For SELL: SL is a Buy Stop
                        var slAction = direction == "BUY" ? OrderAction.Sell : OrderAction.Buy;
                        var slType = OrderType.StopMarket;
                        var slOrder = acc.CreateOrder(instrument, slAction, slType, TimeInForce.Gtc,
                            contracts, 0, sl, "", "HydraX-SL-" + magic, null);
                        if (slOrder != null)
                        {
                            acc.Submit(new[] { slOrder });
                            Log("HydraX: SL " + sl + " placed for " + symbol + " on " + acc.Name, LogLevel.Information);
                        }
                    }
                    if (tp > 0)
                    {
                        // For BUY: TP is a Sell Limit. For SELL: TP is a Buy Limit
                        var tpAction = direction == "BUY" ? OrderAction.Sell : OrderAction.Buy;
                        var tpType = OrderType.Limit;
                        var tpOrder = acc.CreateOrder(instrument, tpAction, tpType, TimeInForce.Gtc,
                            contracts, tp, 0, "", "HydraX-TP-" + magic, null);
                        if (tpOrder != null)
                        {
                            acc.Submit(new[] { tpOrder });
                            Log("HydraX: TP " + tp + " placed for " + symbol + " on " + acc.Name, LogLevel.Information);
                        }
                    }
                    return "{\"ok\":true,\"position_id\":\"" + symbol + "_" + DateTime.Now.Ticks + "\"}";
                }

                return "{\"ok\":false,\"error\":\"Order " + order.OrderState + "\"}";
            }
            catch (Exception ex)
            {
                return "{\"ok\":false,\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}";
            }
        }

        private string ClosePosition(Dictionary<string, object> cmd)
        {
            var acc = GetAccount(cmd);
            if (acc == null) return "{\"ok\":false,\"error\":\"No account\"}";

            try
            {
                string symbol = cmd.ContainsKey("symbol") ? cmd["symbol"].ToString() : "";
                int closed = 0;

                var positions = acc.Positions.Where(p => p.Quantity != 0);
                if (!string.IsNullOrEmpty(symbol))
                    positions = positions.Where(p => p.Instrument.FullName == symbol);

                foreach (var pos in positions.ToList())
                {
                    var orderAction = pos.MarketPosition == MarketPosition.Long
                        ? OrderAction.Sell : OrderAction.Buy;

                    var order = acc.CreateOrder(
                        pos.Instrument,
                        orderAction,
                        OrderType.Market,
                        TimeInForce.Gtc,
                        Math.Abs(pos.Quantity),
                        0, 0, "", "HydraX Close", null
                    );

                    if (order != null)
                    {
                        acc.Submit(new[] { order });
                        closed++;
                    }
                }

                return "{\"ok\":true,\"closed\":" + closed + "}";
            }
            catch (Exception ex)
            {
                return "{\"ok\":false,\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}";
            }
        }
    }
}
