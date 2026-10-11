# QA v2 / lens "audio" -- loop seam analysis on the offline renders (out/qa_v2/audio/wav/<track>.wav = intro + 2 loop cycles).
# For every seam (intro->loop, loop->loop) and tempo: step ratio (largest |dx| within +-2 ms vs the 99.9th percentile of |dx| in the 4 s before), level jump
# (50 ms RMS before/after), envelope difference of the 1.5 s before vs after (dB), low-band (<200 Hz) and high-band (>2 kHz) steps separately, DC offset step.
import sys, wave, json, numpy as np
SR = 24000
INFO = {  # intro seconds, loop seconds at tempo 1 (from tracklist / AUDIO._info)
}
def load(path):
    w = wave.open(path, 'rb'); n = w.getnframes(); raw = w.readframes(n); w.close()
    a = np.frombuffer(raw, dtype='<i2').reshape(-1, 2).astype(np.float64) / 32768.0
    return a
def fft_filter(x, lo, hi):
    n = len(x); X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1.0 / SR)
    m = (f >= lo) & (f < hi); X[~m] = 0
    return np.fft.irfft(X, n)
def env(x, ms):
    w = int(SR * ms / 1000); n = len(x) // w
    return 10 * np.log10(np.mean(x[:n * w].reshape(n, w) ** 2, axis=1) + 1e-12)
def seam_metrics(a, ts):
    i = int(round(ts * SR))
    L = a[:, 0]; M = 0.5 * (a[:, 0] + a[:, 1])
    pre = L[i - 4 * SR:i]; d = np.abs(np.diff(pre)); p999 = np.percentile(d, 99.9) + 1e-12
    seg = L[i - int(0.002 * SR): i + int(0.002 * SR)]
    step = np.max(np.abs(np.diff(seg))) / p999
    out = {'stepRatio': float(step)}
    for name, lo, hi in (('low<200', 20, 200), ('high>2k', 2000, 12000)):
        w = M[i - 2 * SR: i + 2 * SR]; fw = fft_filter(w, lo, hi)
        c = len(fw) // 2; pre = fw[:c - 1]; dd = np.abs(np.diff(pre)); p = np.percentile(dd, 99.9) + 1e-12
        s = np.max(np.abs(np.diff(fw[c - int(0.003 * SR): c + int(0.003 * SR)]))) / p
        out['step_' + name] = float(s)
    r1 = np.sqrt(np.mean(M[i - int(0.05 * SR): i] ** 2) + 1e-12); r2 = np.sqrt(np.mean(M[i: i + int(0.05 * SR)] ** 2) + 1e-12)
    out['jump50ms_dB'] = float(20 * np.log10(r2 / r1))
    e1 = env(M[i - int(1.5 * SR): i], 100); e2 = env(M[i: i + int(1.5 * SR)], 100)
    out['envDiff_dB'] = float(np.mean(np.abs(e1 - e2))); out['envDiffMax_dB'] = float(np.max(np.abs(e1 - e2)))
    # quiet gap at the seam: min 20 ms envelope within +-300 ms relative to the bar before
    e = env(M[i - int(0.3 * SR): i + int(0.3 * SR)], 20)
    out['minEnv20ms_dB'] = float(e.min()); out['lastBarMean_dB'] = float(np.mean(env(M[i - int(2 * SR): i], 20)))
    out['dc_step'] = float(abs(np.mean(M[i: i + int(0.02 * SR)]) - np.mean(M[i - int(0.02 * SR): i])))
    return out
if __name__ == '__main__':
    info = json.load(open(sys.argv[1]))
    res = {}
    for key, d in info.items():
        a = load(d['wav']); seams = []
        for label, ts in d['seams']:
            if int(ts * SR) + 2 * SR <= len(a) and ts > 4.5:
                m = seam_metrics(a, ts); m['label'] = label; m['t'] = ts; seams.append(m)
        res[key] = seams
        print('== ' + key)
        for m in seams:
            print('  %-14s t=%7.2fs step %.2f  lowStep %.2f highStep %.2f  jump50ms %+.1f dB  envDiff %.1f dB (max %.1f)  minEnv20ms %.1f (last 2s mean %.1f)  dc %.4f' % (m['label'], m['t'], m['stepRatio'], m['step_low<200'], m['step_high>2k'], m['jump50ms_dB'], m['envDiff_dB'], m['envDiffMax_dB'], m['minEnv20ms_dB'], m['lastBarMean_dB'], m['dc_step']))
    json.dump(res, open(sys.argv[1].replace('.json', '_result.json'), 'w'), indent=1)
