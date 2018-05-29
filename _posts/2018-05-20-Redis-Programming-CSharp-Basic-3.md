---
layout: post
title: Redis系列 - C#存取Redis (下)
key: Redis-Programming-CSharp-Basic-3
tags: [Redis, C#, StackExchange.Redis, Trouble Shooting]
mermaid: true
---
# C#存取Redis - Timeout trouble shooting

這一篇是討論Timeout trouble shooting為主，有一些基礎知識不再贅述，請參考本人之前的文章。

- [Redis系列 - 環境建置篇]({% post_url 2018-05-02-Redis-Environment-Installation-Configuration %})
- [Redis系列 - C#存取Redis (上)]({% post_url 2018-05-11-Redis-Programming-CSharp-Basic-1 %})
- [Redis系列 - C#存取Redis (中)]({% post_url 2018-05-13-Redis-Programming-CSharp-Basic-2 %})

<!--more-->

`System.TimeoutException`是很常看到的Exception之一，發生的時候會看到類似這樣的錯誤訊息:

```csharp
System.TimeoutException: Timeout performing MGET 2728cc84-58ae-406b-8ec8-3f962419f641,
inst: 1,mgr: Inactive, queue: 73, qu=6, qs=67, qc=0, wr=1/1, in=0/0
IOCP: (Busy=6, Free=999, Min=2,Max=1000), WORKER (Busy=7,Free=8184,Min=2,Max=8191)
```

這個錯誤訊息跟StackExchange.Redis的sync timout設定值有很直接的關聯，預設值是1000 ms。

sync time是指從發送同步request到收到response的時間，不能超過sync timeout的設定值。

大部份的情況都很夠用了，但如果有以下幾類狀況就有可能引發這個Exception。

## High CPU usage/Memory pressure/Network latency

這一類屬於環境問題。

CPU or Memory使用率過高是屬於CPU bound的問題，會影響執行StackExchange.Redis的Thread無法獲得CPU資源，進而發生Timeout。CPU是直接影響，而Memory是因為CLR的Garbage Collection機制，當開始GC時會暫停所有工作。對Redis server來說，很可能發送出去的指令早就已經被處理完成並回傳了，卻因為上述情形，造成處理時間最終超過sync timeout的設定值。

Network latency則是I/O bound，網路環境如果不是很穩定，比如跨Internet存取Redis，可能某個路由節點不穩定讓網路延遲變成500ms，request+response來回就是1000ms，那麼就會發生timeout了。若是屬於跨網路存取的高延遲，可以考慮將`Sync timeout`的設定值調高一些。

```csharp
var conn = ConnectionMultiplexer.Connect("localhost:6379, synctimeout=1500");
```

## Burst Traffic

瞬間流量暴增，這個狀況就要先談一下CLR的ThreadPool跟IOCP/WORKER之間的關係。

CLR的ThreadPool有2種類型的執行緒(Thread)，一種是`IOCP(I/O Completion Port) thread`，另一種就是`Worker thread`，這2類其實都是thread，只是Worker thread是給一般非同步工作用的，而IOCP thread是另外保留給非同步I/O執行時使用的。

ThreadPool在管理這些threads時，有一個`MinThreads`的設定，預設值取決於有多少個CPU core，例如有4個CPU core，則預設有4條Worker threads與4條IOCP threads。

底下這段程式可以看到系統實際的狀況

```csharp
static void Main(string[] args)
{
    int minWorkerThreads, minIOCPThreads;
    int logicCores = Environment.ProcessorCount;
    ThreadPool.GetMinThreads(out minWorkerThreads, out minIOCPThreads);
    Console.WriteLine($"Cores: {logicCores}");
    Console.WriteLine($"Minimum Worker threads: {minWorkerThreads}");
    Console.WriteLine($"Minimum IOCP threads: {minIOCPThreads}");
    Console.Read();
}
```

這個設定值的意思是，如果目前的Busy Threads = MinThreads時，ThreadPool就會開始建立並注入新的可用thread到ThreadPool裡。

實際運行的時候，假設需要一個IOCP thread，而ThreadPool內有可用的thread，就會立刻配出去使用。但***如果目前的Busy Threads = Min Threads，就會讓這個請求進入排隊等候，等待`500ms`後依然沒有可用的thread，就會注入一條新的thread給目前排隊的第一順位請求***，而始終閒置的thread則在15秒後會被釋放。

看到這邊有沒有發現問題了? 由於預設的最小Worker/IOCP threads不足以服務大量湧入的請求，就會需要等待500ms才能在ThreadPool拿到可用的thread，在這個狀況下很有機會因等待建立新thread而發生Timeout exception。

如果StackExchange.Redis是用在Web，則會使用IIS的預設值，基本上是沒什麼問題的，如果要自行控制得要修改machine.config。

```xml
<processModel autoConfig="false" minWorkerThreads="50" minIoThreads="50" />
```

若為Windows Service或其他非掛載於IIS的Service，就要注意ThreadPool.MinThreads是否有依實際的狀況調整適當的初始值。

```csharp
var minWorkers = 16;
var minIOCPs = 16;
ThreadPool.SetMinThreads(minWorkers, minIOCPs);
```

這個狀況可以觀察幾個指標，首先看`IOCP`及`WORKER`裡的`Busy`與`Min`，如果`Busy`>`Min`就表示有可能是ThreadPool的設定值並沒有為流量做最佳化。

## Large Request/Response size

實務上這個應該是最常遇到的，因為跟資料結構的設計有最直接的關係。

假設Sync timeout設為1000，同時有2個request需要讀取Key A與Key B的value，因為StackExchange.Redis的Multiplexer機制是共用connection，當使用pipeline機制發出這2個request時會連續發送而不會等待前一個response，而Redis server則會依發送的順序，依序回傳Response。

此時如果response的data size很大，傳輸的時間就有可能超過設定的time out時間，引發Timeout exception，如下圖所示：

```shell
|-------- 1 Second Timeout (A)----------|
|-Request A-|
     |-------- 1 Second Timeout (B) ----------|
     |-Request B-|
            |- Read Response A --------|
                                       |- Read Response B-| (**TIMEOUT**)
```

這個狀況是Client讀取回傳的response A，這時request A + response A的時間還在1秒內，所以request A正常結束，但讀取Response B因為要等Response A讀取完成，這時request B的時間是要再**加上等待讀取response A完成的時間**，而不是只有加上讀取Response B的時間就好。

這個data size的設計跟MTU有關。MTU是網卡的最大傳輸單元，Ethernet的預設值通常是1500 bytes，當超過這個值的時候就會被拆成不同的封包傳送，且若發生封包碰撞則必須重傳，這是TCP/IP的協議規範之一。

Redis的value資料長度如果大於MTU，表示在TCP傳輸的時候要分成多個封包進行傳輸，不但會大幅降低Redis的throughput，大到一定程度後還會發生timeout exception。

如果是屬於這個狀況，就要想辦法調整儲存的資料結構，把一個大的key/value拆成好幾個小的key/value，或以Hash的結構存放，個人的建議是儘可能的讓單個key/value可以小於1KB，以本人實測的結果，1KB的資料長度是throughput最高的。

## Commands taking long time to process on Redis server

最後一個狀況就是執行的指令在Redis跑的太久了，比如跑了一個寫的很爛的Lua script，或是下了會造成blocking的指令，如`MGET`，`KEYS`…等。

這要連到Server上執行`slowlog`指令，列出執行效率低落的指令才能進行調校。

這類型的問題比較有效的解決方式還是靠code review、pair programming跟training的方式，協助團隊內不熟悉Redis的工程師儘快熟悉，避免寫出不好的程式碼。

## 錯誤訊息代碼說明

另外關於StackExchange.Redis的錯誤訊息，裡面有很多縮寫代碼，Microsoft Azure有整理了一份代碼的說明表格。

[StackExchange.Redis Timeout Exception Error Code](https://azure.microsoft.com/en-us/blog/investigating-timeout-exceptions-in-stackexchange-redis-for-azure-redis-cache/){:target="_blank"}

## 小結

這篇算是C#存取Redis很重要的一個部份，很多人常會卡在timeout exception要如何處理，其實很多時候都是一些基礎知識，掌握好基礎後，處理這些問題就變的很輕鬆了。

這篇原則上還是把範圍限縮在Client端，畢竟主題是講C#存取Redis，之後有機會再整理Server端的問題排查就會更全面了。
