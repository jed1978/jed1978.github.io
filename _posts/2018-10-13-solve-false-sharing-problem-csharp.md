---
layout: post
title: 多執行緒程式的效能隱形殺手 - False sharing
key: False sharing
tags: [false sharing, multi thread]
---
# 多執行緒碰上多核心

由於現在的CPU都是多核心，為了充份利用CPU的運算能力，開發多執行緒的程式就成為一件很合理的事情，而且.Net framework在4.0開始對平行運算提供了愈來愈完整的支援，開發多執行緒的程式跑在多核心的主機這件事，也變的愈來愈簡單。

但在某些場景，使用多執行緒運算並不見得會提昇運算效率，不正確的使用多執行緒運算甚至會拖慢系統效能。
<!--more-->
下圖是一個測試結果，運算的程式碼完全一樣，差別只在處理的class。

程式的邏輯是分別建立4個Task，各自對同一個object的四個屬性做遞增寫入，理論上寫入不同的變數是不需要lock的，所以效能應該很好，但執行後的結果並非如此。

![false-sharing-comparison](/assets/images/false-sharing-comparison.png)

你可能會有疑問，為何會有2種差異相當大的運行結果?

## CPU快取

其實問題就出在多核心CPU的快取存取策略，現在的CPU核心運算時脈都很高，但RAM的時脈卻跟不上CPU的速度，為了發揮CPU的效能，因此有了L1/L2/L3等多級快取。其中L1/L2 快取是跟著每一個CPU核心，而L3則是所有核心共用。

既然叫快取，就會有快取失效的問題，當快取失效時，就必須透過Memory controller從RAM讀取資料再刷新至各級快取。

![CPU Cache](/assets/images/cpu-cache.png)

## Cache line造成的寫入效能問題

CPU快取的存取單位是`Cache line`(or Cache block)，大小限制很多種，小至32 bytes, 大至256 bytes都有，取決於CPU的設計，但目前常見CPU的Cache line都是`64 bytes`。

當我們宣告變數或物件時，會配置在連續的記憶體空間，而CPU在存取一個變數時，會依cache line的大小，連同存放在相臨記憶體的資料一併讀入。這個機制提昇了讀取的效率，特別是像Array這種集合類型，因為CPU不需要從主記憶體再載入新的資料就能持續運算。

回寫資料時，快取的寫入策略有2種方式，一種是Write back，一種是Write through。以CPU的設計都是Write through，因此當有寫入時，會引發一連串的記憶體寫入操作，在多核心的架構則會讓不同核心的L1/L2 cache失效與強迫重載，

當在開發多執行緒的程式時，若要同時對一個變數寫入，就必須加上Lock機制，但Lock會造成效能損耗已是常識，因此我們在設計時會儘量避免寫入同一個變數，但實際上即便同時寫不同的變數，如果被載入到同一個Cache line，就會發生寫完之後快取失效必須重載的現象，這個現象稱之為`False sharing`。

![CPU Cache miss](/assets/images/cacheline-cache-miss.png)

## 如何在C#避免False sharing

前面說了這麼久，總算講到重點了…

要在C#避免False sharing，很關鍵的一點就是我們能不能決定Cache line要讀哪些變數? 嚴格來說答案是不行，並沒有指令可以讓我們決定Cache line要放哪些變數。

前面提到過目前常見CPU的Cache line大小是64 bytes，這意味著只要我們可以用空間來換效能，只要這個Cache line放的只有一個變數，不就沒有False sharing的問題了嗎?

.Net有一個StructLayout的attribute，可以用來指定class/struct的各個field的記憶體佈局，常用在呼叫Win32 API，剛好可以用來幫助我們做這件事。

```csharp
[StructLayout(LayoutKind.Explicit)]
public class PaddedValueDto
{
    [FieldOffset(56)]
    public long CounterForCore1;
    
    [FieldOffset(120)]
    public long CounterForCore2;
    
    [FieldOffset(184)]
    public long CounterForCore3;
    
    [FieldOffset(248)]
    public long CounterForCore4;
}
```

以上這個class使用了`StructLayout(LayoutKind.Explicit)`，這會告訴CLR，這個class在記憶體的layout完全我們自行決定，因此接下來的每個field都必須加上`[FieldOffset(xx)]`的偏移量設定，如果這邊沒設好，就會造成記憶體錯亂，要很小心。

FieldOffset是從前一個field結束後，要偏移的byte數量，每一個field還要加上型別本身佔的空間，以這個範例來解釋的話，Long佔8 bytes，第一個`CounterForCore1`就先從0偏移56個bytes，然後佔用8 bytes，這樣加起來正好64 bytes，後續的幾個field以此類推。

這邊要提醒的是，FieldOffset只能用在Field，Property是不能使用的。

## 小結

StructLayout其他的設定值因與這個主題無關，我就不再多談了，但其實StructLayout在socket programming上也是有很好的運用方式，有機會再來討論這個部份。

這個主題我也準備了一個範例程式碼，用來比較避開False sharing的多執行緒程式執行效能，其實範例程式碼還比較早出現，原本是用來補充之前在台中講Disruptor.Net的不足，但後來有些網上的同學私下問我這個主題，為了幫助大家更好的理解，所以才有了這篇文章。

廢話不多說，source code在此: [False sharing 範例程式碼](https://github.com/jed1978/false-sharing){:target="_blank"}