# Cloudflare Realtime Pricing Calculator

## Source

https://developers.cloudflare.com/calls/pricing/

## Cloudflare Pricing (Actual)

| Component                  | Price              | Notes                     |
| -------------------------- | ------------------ | ------------------------- |
| **Egress (SFU → clients)** | **$0.05/GB**       | After 1,000 GB free tier  |
| Ingress (clients → SFU)    | **FREE**           | Always free               |
| TURN relay                 | $0.05/GB           | Shared free tier with SFU |
| **Free tier**              | **1,000 GB/month** | Combined SFU + TURN       |

## Assumptions

### Stream Characteristics (720p HD)

| Parameter           | Value          |
| ------------------- | -------------- |
| Video bitrate       | 1.5 Mbps       |
| Audio bitrate       | 64 kbps        |
| **Total stream**    | **1.564 Mbps** |
| Per hour per stream | ~704 MB/hour   |

## Corrected Formula

### Egress Data (what you pay for)

```
Total Egress = N × (N-1) × bitrate × time

Where:
- N = total participants
- (N-1) = streams each person receives
- Ingress is FREE (not counted)
```

### Cost Formula

```
Cost/hour = N × (N-1) × 0.704 GB × $0.05
          = N(N-1) × $0.0352

After free tier (first 1,000 GB/month):
Cost = max(0, N(N-1) × hours × 0.704 - 1000) × $0.05
```

## Cost Calculator

### Hourly Costs (After Free Tier)

| Participants | Egress Streams | GB/hour  | Cost/hour  | Monthly\* |
| ------------ | -------------- | -------- | ---------- | --------- |
| **2**        | 2              | 1.4 GB   | **$0.07**  | $50       |
| **3**        | 6              | 4.2 GB   | **$0.21**  | $151      |
| **4**        | 12             | 8.4 GB   | **$0.42**  | $302      |
| **5**        | 20             | 14.1 GB  | **$0.70**  | $505      |
| **10**       | 90             | 63.4 GB  | **$3.17**  | $2,281    |
| **20**       | 380            | 267.5 GB | **$13.38** | $9,628    |
| **50**       | 2,450          | 1,725 GB | **$86.24** | $62,100   |

\* Monthly = 8 hours/day × 22 work days, minus 1,000 GB free tier

### The Free Tier Impact

**1,000 GB free = ~1,420 participant-hours**

| Scenario           | Free Hours | Paid Hours/Month |
| ------------------ | ---------- | ---------------- |
| 2 people, 8hr/day  | 710 hours  | **FREE**         |
| 5 people, 4hr/day  | 71 hours   | 105 hours paid   |
| 10 people, 2hr/day | 7 hours    | 37 hours paid    |

## Comparison: Old vs New Model

| Participants | Wrong (per-min) | Correct (per-GB) | Savings |
| ------------ | --------------- | ---------------- | ------- |
| 2            | $0.96/hr        | $0.07/hr         | **93%** |
| 10           | $24/hr          | $3.17/hr         | **87%** |
| 50           | $600/hr         | $86/hr           | **86%** |

## Optimization Strategies

### 1. Stay Within Free Tier

```
Max hours/month = 1000 GB / [N(N-1) × 0.704 GB/hr]

For 4 people: 1000 / 8.4 = 119 hours/month free
```

### 2. Reduce Bitrate

```
360p instead of 720p: ~0.5 Mbps vs 1.5 Mbps
Cost reduction: 67% less
```

### 3. Limit Simulcast Layers

Don't send multiple quality tiers if not needed.

### 4. Pause Inactive Tracks

```javascript
// Stop billing for video when tab hidden
document.addEventListener("visibilitychange", () => {
  videoTrack.enabled = !document.hidden;
});
```

### 5. Switch to CDN for Large Groups

```
50 people SFU: $86/hour
50 people CDN: ~$5/hour (HLS/DASH)
```

## Real-World Scenarios

### Scenario A: Small Team (5 people, 2 hours/day)

```
Daily: 5 × 4 × 0.704 × 2 = 28.2 GB
Monthly: 620 GB
Cost: FREE (under 1,000 GB)
```

### Scenario B: Startup Standup (10 people, 1 hour/day)

```
Daily: 10 × 9 × 0.704 × 1 = 63.4 GB
Monthly: 1,395 GB
Cost: 395 GB × $0.05 = $19.75/month
```

### Scenario C: Webinar (3 speakers, 97 viewers, 1 hour)

```
Speakers: 3 streams
Viewers: 97 people × 3 streams each
Egress: 3 × 97 × 0.704 = 205 GB
Cost: 205 × $0.05 = $10.25/hour
```

## Alternative: RealtimeKit (Beta)

If you want simpler billing:

- **$0.002/min** for audio/video
- **$0.0005/min** for audio-only
- Per-participant-minute model

Compare to SFU for 10 people, 1 hour:

- SFU: 90 streams × 0.704 GB × $0.05 = $3.17
- RealtimeKit: 10 people × 60 min × $0.002 = $1.20

**RealtimeKit can be cheaper for small groups.**

## Quick Formula

```
Monthly Cost = max(0, N(N-1) × hours × 0.704 - 1000) × $0.05

Where:
- N = participants
- hours = total hours in month
- 0.704 GB/hour = at 1.5 Mbps
- 1000 GB = free tier
- $0.05 = per GB rate
```

## Key Takeaways

1. ✅ **Ingress is free** - Uploading costs nothing
2. ✅ **1,000 GB free** - Generous free tier
3. ✅ **Much cheaper** than per-minute assumptions
4. ⚠️ **Still N² growth** - Large groups are expensive
5. 💡 **Measure actual usage** - Cloudflare dashboard shows egress

---

_Pricing as of 2026-03-18. Verify at https://developers.cloudflare.com/calls/pricing/_
