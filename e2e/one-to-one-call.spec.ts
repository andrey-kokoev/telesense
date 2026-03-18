import { test, expect, BrowserContext, Page } from '@playwright/test'

// E2E Test: Full 1:1 video call via Cloudflare Realtime
// This test automates the manual two-tab test procedure

test.describe('1:1 Video Call', () => {
  let callerContext: BrowserContext
  let callerPage: Page
  let calleeContext: BrowserContext
  let calleePage: Page
  const CALL_ID = `e2e-test-${Date.now()}`

  test.beforeAll(async ({ browser }) => {
    // Create two separate browser contexts (simulates two users)
    // Each context gets its own camera/mic permissions
    callerContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })
    calleeContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })

    callerPage = await callerContext.newPage()
    calleePage = await calleeContext.newPage()
  })

  test.afterAll(async () => {
    await callerContext.close()
    await calleeContext.close()
  })

  test('caller joins and publishes tracks', async () => {
    await callerPage.goto(`/?call=${CALL_ID}`)
    
    // Wait for initialization
    await expect(callerPage.locator('#status')).toContainText('Initializing', { timeout: 5000 })
    
    // Wait for local media capture
    await expect(callerPage.locator('#status')).toContainText('Local media captured', { timeout: 10000 })
    
    // Wait for session creation
    await expect(callerPage.locator('#status')).toContainText('Session created', { timeout: 10000 })
    
    // Wait for publish
    await expect(callerPage.locator('#status')).toContainText('Published and connected', { timeout: 15000 })
    
    // Wait for ICE connected
    await expect(callerPage.locator('#status')).toContainText('Publish ICE connected', { timeout: 15000 })
    
    // Verify local video has stream
    const localVideo = callerPage.locator('video#local')
    await expect(localVideo).toHaveAttribute('srcObject')
    
    // Take screenshot of caller
    await callerPage.screenshot({ path: 'test-results/caller-joined.png' })
  })

  test('callee joins and both see each other', async () => {
    // Callee joins the same call
    await calleePage.goto(`/?call=${CALL_ID}`)
    
    // Wait for callee initialization
    await expect(calleePage.locator('#status')).toContainText('Local media captured', { timeout: 10000 })
    await expect(calleePage.locator('#status')).toContainText('Published and connected', { timeout: 15000 })
    
    // Give time for discovery and subscription
    await calleePage.waitForTimeout(3000)
    
    // Caller should discover callee's tracks
    await expect(callerPage.locator('#status')).toContainText('Found', { timeout: 10000 })
    await expect(callerPage.locator('#status')).toContainText('new remote track', { timeout: 10000 })
    
    // Callee should also discover and subscribe
    await expect(calleePage.locator('#status')).toContainText('Found', { timeout: 10000 })
    
    // Wait for subscription to complete
    await expect(callerPage.locator('#status')).toContainText('Subscribed to remote tracks', { timeout: 15000 })
    await expect(calleePage.locator('#status')).toContainText('Subscribed to remote tracks', { timeout: 15000 })
    
    // Wait for media to flow (additional delay)
    await callerPage.waitForTimeout(2000)
    await calleePage.waitForTimeout(2000)
    
    // Verify both have remote video with srcObject
    const callerRemoteVideo = callerPage.locator('video#remote')
    const calleeRemoteVideo = calleePage.locator('video#remote')
    
    // Check that remote video elements exist and have been set up
    await expect(callerRemoteVideo).toBeVisible()
    await expect(calleeRemoteVideo).toBeVisible()
    
    // Take final screenshots
    await callerPage.screenshot({ path: 'test-results/caller-final.png' })
    await calleePage.screenshot({ path: 'test-results/callee-final.png' })
    
    // Success! Both sides have remote video elements
    console.log('✅ 1:1 call established successfully')
  })

  test('both videos are playing', async () => {
    // Verify video elements are actually playing (have videoWidth > 0)
    const callerRemoteVideo = callerPage.locator('video#remote')
    const calleeRemoteVideo = calleePage.locator('video#remote')
    
    // Check video dimensions (indicates stream is flowing)
    const callerWidth = await callerRemoteVideo.evaluate((el: HTMLVideoElement) => el.videoWidth)
    const calleeWidth = await calleeRemoteVideo.evaluate((el: HTMLVideoElement) => el.videoWidth)
    
    console.log(`Caller remote video width: ${callerWidth}`)
    console.log(`Callee remote video width: ${calleeWidth}`)
    
    // Both should have actual video dimensions (not 0)
    expect(callerWidth).toBeGreaterThan(0)
    expect(calleeWidth).toBeGreaterThan(0)
  })
})
