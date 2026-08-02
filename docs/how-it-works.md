# How Redact handles your information

This page explains, in plain language, exactly what happens to your details
when you use Redact. No jargon, no fine print you need a lawyer for.

## The short version

- What you type stays **on your own device**.
- It's sent out **only** when you press **Scan** or **Clean**, and **only** to
  do that one job.
- It's **never** sold, shared, or stored after the job.

## The longer version

### When you type your info

The moment you enter your name and address, Redact saves it in something called
`localStorage` — a private notepad your browser keeps just for this site, on
your device. It never automatically leaves your phone or computer. If you close
the tab and come back, it's still there so you don't have to retype it. If you
tap **"Erase my info from this device"** (or clear your browser data), it's
gone for good.

There is **no account** and **no central database** with your information in it.
Nobody at Redact can see what you typed, because it never reaches them.

### When you press "Scan"

To find where you're listed, something has to actually go out and *look* at the
broker websites — a web page sitting on your phone can't do that by itself
(browsers block one website from reaching into another). So when you tap Scan,
your details are sent to Redact's **scanning helper**: a small program on a
server whose only job is to check the brokers and report back what it finds.

That helper keeps your details **only in memory**, only for the length of the
scan. Nothing is written to a disk. When the job ends, it's wiped. Restart the
server and every trace is gone — which is exactly how a privacy tool should
behave.

### When you press "Clean"

Same idea: your details go to the helper just long enough to submit the removal
requests, then they're discarded. For brokers that require a code from your
email or a phone check, the helper can't finish for you — it hands that step
back to you with a direct link, because faking a confirmation isn't something a
tool should do.

### Why not do everything on the phone with nothing sent anywhere?

Because "scan the brokers" literally means visiting other companies' websites,
and your browser (rightly) won't let one site drive another. The only way to
offer a real one-tap scan is to have a helper do the visiting. Redact keeps that
helper as small and forgetful as possible, and is upfront that this is the one
moment your info travels.

If you'd rather **nothing ever leave your device at all**, use the **guided
list**: it prepares each removal request for you and you send it yourself. Same
result, fully in your hands.

## Want to verify all this?

Redact is open source — the scanning helper's code is in the
[`/server`](../server/) folder, and the app's code is right here in the repo.
You (or anyone you trust) can read exactly what it does.
