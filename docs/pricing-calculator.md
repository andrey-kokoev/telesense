# Cloudflare Realtime Pricing Calculator

## Assumptions

### Stream Characteristics (720p HD)
| Parameter | Value |
|-----------|-------|
| Video bitrate | 1.5 Mbps |
| Audio bitrate | 64 kbps |
| **Total stream** | **1.564 Mbps** |
| Per minute data | ~11.7 MB/min |
| Per hour data | ~704 MB/hour |

### Example Pricing (Verify Current Rates!)
| Component | Example Rate | Your Rate |
|-----------|--------------|-----------|
| Participant minutes | **$0.004/min** | Check Cloudflare docs |
| TURN relay | $0.05/GB | Check Cloudflare docs |
| Egress bandwidth | $0.005/GB | Check Cloudflare docs |

**⚠️ IMPORTANT**: These are **example rates** for calculation purposes. 

**Get current pricing:**
- https://developers.cloudflare.com/calls/pricing/
- Or: `curl https://api.cloudflare.com/client/v4/zones/{zone_id}/billing`

---

## Formula: Cost for N Participants (Full Mesh)

### Billing Units (Segments)
```
Segments per minute = N²

Where:
- N = total participants
- Each person sends 1 stream (upload)
- Each person receives (N-1) streams (download)
- Total = N + N(N-1) = N²
```

### Cost Formula
```
Cost per minute = N² × R
Cost per hour   = N² × R × 60
                = N² × H

Where:
- R = rate per participant-minute (e.g., $0.004)
- H = rate per segment-hour (R × 60)
```

---

## Cost Calculator (Example: R = $0.004/min)

| Participants | Segments/min | Cost/min | Cost/hour | Cost/day |
|--------------|--------------|----------|-----------|----------|
| **2** (1:1) | 4 | $0.016 | $0.96 | $23.04 |
| **3** (trio) | 9 | $0.036 | $2.16 | $51.84 |
| **4** (small) | 16 | $0.064 | $3.84 | $92.16 |
| **5** | 25 | $0.10 | $6.00 | $144.00 |
| **10** | 100 | $0.40 | $24.00 | $576.00 |
| **20** | 400 | $1.60 | $96.00 | $2,304.00 |
| **50** | 2,500 | $10.00 | $600.00 | $14,400.00 |

**Replace with your actual rate R:**
```
Your Cost/hour = N² × (R × 60)
```

### The Quadratic Wall
```
10 people  = $24/hour  (manageable)
20 people  = $96/hour  (ouch)
50 people  = $600/hour (prohibitive)
100 people = $2,400/hour (insane)
```

---

## Data Transfer Formula

### Per Participant
```
Upload:   1.564 Mbps
Download: 1.564 × (N-1) Mbps
Total per person: 1.564 × N Mbps

Group total: 1.564 × N² Mbps
```

### Example: 10 People for 1 Hour
```
Total bandwidth: 1.564 Mbps × 100 segments × 3600 seconds
               = 563,040 Mbit
               = 70.38 GB

At $0.005/GB egress: $0.35/hour (much smaller than participant cost)
```

**Conclusion**: Participant minutes dominate cost, not bandwidth.

---

## Optimized Scenarios

### Scenario A: 3 Speakers + 97 Viewers
```
Publishers (P) = 3
Viewers (S) = 97

Segments = P × (1 + S) 
         = 3 × 98 
         = 294 segments/min

Cost/hour = 294 × $0.004 × 60 = $70.56

vs full mesh: 10,000 segments = $2,400/hour
Savings: 97% 🎉
```

### Scenario B: Screen Share (3 Mbps) + 2 Cameras
```
Screen: 3.0 Mbps
Cam A:  1.5 Mbps  
Cam B:  1.5 Mbps

If 10 people subscribe to all 3:
Segments = 3 streams × 10 subscribers = 30 segments/min
Cost/hour = 30 × $0.004 × 60 = $7.20
```

---

## Cost Optimization Strategies

### 1. Limit Simulcast
Don't send multiple quality layers if not needed.

### 2. Pause Inactive
Mute video when tab not visible:
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    videoTrack.enabled = false  // Stops billing for that track
  }
})
```

### 3. Selective Subscription
Only subscribe to visible speakers:
```
Instead of: 10 people × 10 video streams = 100 segments
Do: 10 people × 3 visible = 30 segments
Savings: 70%
```

### 4. Switch to CDN for 100+ Viewers
```
SFU  (100 viewers): 10,000 segments = $2,400/hour
CDN  (100 viewers): 1 stream + 100 HLS pulls = ~$50/hour
```

---

## Quick Formula Reference

```
Full mesh cost/hour = N² × H

Where:
- N = participants
- H = your cost per segment-hour (rate per min × 60)

Data volume/hour = N² × 0.704 GB
                  (at 1.564 Mbps per stream)
```

## Break-Even Analysis

| Use Case | Max Participants | Reason |
|----------|------------------|--------|
| 1:1 calls | 2 | Optimal use case |
| Small meeting | 4-6 | Manageable cost |
| Team standup | 8-10 | Budget limit |
| Webinar | 3-5 speakers + CDN | Switch to CDN for viewers |
| Broadcast | SFU not suitable | Use HLS/DASH |

---

**⚠️ DISCLAIMER: All prices are EXAMPLES. Check https://developers.cloudflare.com/calls/pricing/ for current rates.**
