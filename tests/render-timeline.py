"""Optional FFmpeg integration check: python tests/render-timeline.py <ffmpeg>"""
import importlib.util, pathlib, subprocess, sys, tempfile, wave, math, array

spec = importlib.util.spec_from_file_location('renderer', pathlib.Path('public/render.py'))
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
assert renderer.dubbing_filter([], 10) is None
try:
    renderer.dubbing_filter([{'start': float('nan'), 'end': 1}], 10)
except ValueError:
    pass
else:
    raise AssertionError('non-finite times accepted')
graph = renderer.dubbing_filter([
    {'start': 1, 'end': 3, 'audioStart': 0},
    {'start': 6, 'end': 99, 'audioStart': 4},
], 10)
assert 'duration=4.0' in graph and 'atrim=duration=10[dubbing]' in graph
if len(sys.argv) > 1:
    with tempfile.TemporaryDirectory() as folder:
        root = pathlib.Path(folder)
        source, output = root/'source.wav', root/'output.wav'
        with wave.open(str(source), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
            # Two tones distinguish the audio source offset from placement time.
            samples = array.array('h', [int(12000*math.sin(2*math.pi*(300 if i<32000 else 900)*i/8000)) for i in range(96000)])
            w.writeframes(samples.tobytes())
        subprocess.run([sys.argv[1], '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=s=16x16:d=10', '-i', str(source), '-filter_complex', graph, '-map', '[dubbing]', '-ar', '8000', '-ac', '1', str(output)], check=True)
        with wave.open(str(output), 'rb') as w:
            assert w.getnframes() == 80000, 'audio must end at exactly 10 seconds'
            pcm = array.array('h', w.readframes(w.getnframes()))
        def rms(a,b):
            values=pcm[round(a*8000):round(b*8000)]
            return math.sqrt(sum(x*x for x in values)/len(values))
        assert rms(0,.9)==0 and rms(3.1,5.9)==0, 'silence gaps must remain'
        assert rms(1.1,2.9)>5000 and rms(6.1,9.9)>5000, 'both cues must play'
        crossings=lambda a,b:sum(pcm[i]<0<=pcm[i+1] for i in range(int(a*8000),int(b*8000)-1))
        assert 290 < crossings(1,2) < 310 and 890 < crossings(6,7) < 910, 'source audio offset must be honored'
        # Separate generated files use their own input stream and start from zero.
        graph = renderer.dubbing_filter([{'start':1,'end':3,'audioStart':0,'inputIndex':1},{'start':6,'end':10,'audioStart':0,'inputIndex':2}],10)
        second=root/'second.wav'
        with wave.open(str(second),'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000)
            w.writeframes(array.array('h',[int(12000*math.sin(2*math.pi*900*i/8000)) for i in range(48000)]).tobytes())
        subprocess.run([sys.argv[1],'-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=s=16x16:d=10','-i',str(source),'-i',str(second),'-filter_complex',graph,'-map','[dubbing]','-ar','8000','-ac','1',str(output)],check=True)
        with wave.open(str(output),'rb') as w:
            assert w.getnframes()==80000
            pcm=array.array('h',w.readframes(w.getnframes()))
        assert rms(3.1,5.9)==0 and 890<crossings(6,7)<910, 'per-line audio must use its own source'
print('PASS dubbing clipping, source offsets, preserved gaps and exact video endpoint.')
