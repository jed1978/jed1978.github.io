---
layout: post
title: Disruptor.Net - IEventTranslator
key: Disruptor
tags: [Disruptor, IEventTranslator, Event Driven]
---
# IEventTranslator

IEventTranslator是在第3版發布的新功能，這篇文章是介紹使用的方式及設計理念

## 生產者發送事件到RingBuffer

事件驅動的一個特性就是透過發送事件給關注的訂閱者，進而讓多個不同的業務邏輯得以實現，以Disruptor的設計，就是要透過`RingBuffer.Publish()`這個方法把事件放入RingBuffer，後面的EventHandler則會依據其掛載的順序，由`SequenceBarrier`調度執行。

<!--more-->
在較早期的版本與範例程式碼，發送Event都是先呼叫`RingBuffer.Next()`取得最新可用的sequence，然後依sequence取得指定的slot中的物件，設定完要傳遞的屬性後，要再呼叫`RingBuffer.Publish()`方法把事件發送出去，大致如以下的程式碼。

```csharp
var sequence = _ringBuffer.Next();
_ringBuffer[sequence].Value = i;
_ringBuffer.Publish(sequence);
```

但這段程式碼有個問題，假如先取得了sequence，但在Publish之前發生Exception會發生什麼事?

## 停滯的RingBuffer

RingBuffer因其特殊的設計，在使用上比傳統的Queue來的複雜，這段程式碼如果不加上try catch/finally，確保最終要把這個sequence發布到RingBuffer，將造成整個RingBuffer停滯不前，必須重啟才能恢復，這在MultiProducer特別容易發生，對一個In-Memory Transaction系統來說，是個非常致命的問題。

所以這段程式碼必須要改成這樣，因而增加了程式碼的複雜度

```csharp
var sequence = 0L;
try
{
    sequence = _ringBuffer.Next();
    _ringBuffer[sequence].Value = i;
}
finally
{
    _ringBuffer.Publish(sequence);
}
```

因此在第3版的Disruptor，LMAX的團隊為簡化這些使用上的複雜性，有了新的`RingBuffer.PublishEvent()`及對應的`IEventTranslator`系列介面。

`PublishEvent()`已內建了try catch/finally，只要實作`IEventTranslator`介面，就可以不再需要自己處理這段程式碼，發送事件只要一行程式碼就可以搞定了。

```csharp
_ringBuffer.PublishEvent(Translator.Instance, message.EventType, message.EventData);
```

程式碼更簡潔，此外也帶來其他額外的好處，EventTranslator很容易撰寫單元測試，也可以依據需求撰寫各種不同的EventTranslator進行抽換。

## 從設計的角度來看EventTranslator

DDD有一個很核心的概念叫Bounded Context，意思是整個Domain可以被劃分出不同的Domain，各有各自的邊界，同樣的事件在不同的Context可能被賦與不同的意義，而不同的Context會有上下游的協作方式，中間可能透過各種方式協作。

而以事件驅動的設計理念，上下游的Context透過事件進行協作，此時單純的以`.Publish()`發送事件就有可能發生一個問題，不同的Context定義的相同事件內容並不完全一致，且隨著需求演變，事件攜帶的資訊可能也需要擴展，有時為了一些相容性(已儲存的事件結構與新的不同)，就會有一些做法容易造成程式碼腐化，而`EventTranslator`的出現，很好的解決了這個問題。

## 使用方式

IEventTranslator有多個多載，可以依需求決定實作哪一個介面

```csharp
IEventTranslatorOneArg<T, A>
IEventTranslatorTwoArg<T, A, B>
IEventTranslatorThreeArg<T, A, B, C>
IEventTranslatorVararg<T>
```

使用的方法都一樣，最後我附上一個實作`IEventTranslatorTwoArg`的Producer程式碼，應該很容易理解如何使用。

```csharp
public class Producer
{
    private readonly RingBuffer<EventMessage> _ringBuffer;

    public Producer(RingBuffer<EventMessage> ringBuffer)
    {
        _ringBuffer = ringBuffer;
    }

    public void OnData(EventMessage message)
    {
        _ringBuffer.PublishEvent(Translator.Instance, message.EventType, message.EventData);
    }

    private class Translator : IEventTranslatorTwoArg<EventMessage, EventType, PayloadInfo>
    {
        public static readonly Translator Instance = new Translator();

        private Translator(){}

        public void TranslateTo(EventMessage @event, long sequence, EventType eventType, PayloadInfo payload)
        {
            @event.EventType = eventType;
            if (eventType == EventType.OrderPlaced)
            {
                @event.EventData.Order = payload.Order;
            }
        }
    }
}
```
