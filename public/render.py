"""Render an exported Director Studio project using local FFmpeg. No network required."""
import json, pathlib, shutil, subprocess, tempfile, math

def run(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)

def dubbing_filter(cues, duration):
    segments = []
    for cue in cues:
        start, end, source = (float(cue.get(k, 0)) for k in ('start', 'end', 'audioStart'))
        if not all(math.isfinite(v) for v in (start, end, source)):
            raise ValueError('配音时间必须是有限数字')
        start, end = max(0, min(duration, start)), max(0, min(duration, end))
        if end <= start:
            continue
        segments.append((start, end, max(0, source), int(cue.get('inputIndex',1))))
    if not segments:
        return None
    filters = [f'[{input_index}:a:0]atrim=start={source}:duration={end-start},asetpts=PTS-STARTPTS,adelay={round(start*1000)}:all=1[d{i}]' for i, (start, end, source, input_index) in enumerate(segments)]
    labels = ''.join(f'[d{i}]' for i in range(len(segments)))
    filters.append(f'{labels}amix=inputs={len(segments)}:normalize=0,apad,atrim=duration={duration}[dubbing]')
    return ';'.join(filters)

def main():
    root = pathlib.Path(__file__).resolve().parent
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise RuntimeError('请先安装 FFmpeg 和 ffprobe 并加入 PATH')
    project = json.loads((root / 'project.json').read_text(encoding='utf-8'))
    shots = [s for s in project['shots'] if s.get('enabled', True)]
    if not shots:
        raise RuntimeError('没有启用的镜头')
    width, height = {'16:9': (1920,1080), '9:16': (1080,1920), '1:1': (1080,1080)}[project['ratio']]
    def media(item):
        p = (root / item['url']).resolve()
        if not p.is_relative_to(root / 'media') or not p.is_file():
            raise RuntimeError('素材缺失或路径无效: ' + item['url'])
        return str(p)
    with tempfile.TemporaryDirectory(prefix='director-') as temp:
        temp = pathlib.Path(temp)
        clips = []
        for i, shot in enumerate(shots):
            duration = float(shot['duration'])
            if not 0.1 <= duration <= 120:
                raise RuntimeError('镜头时长必须在0.1至120秒之间')
            video, image, audio = shot.get('video'), shot.get('image'), shot.get('audio')
            if not video and not image:
                raise RuntimeError(f'镜头{i+1}缺少视频或图片')
            args = ['-ss', str(shot.get('trimStart', 0)), '-i', media(video)] if video else ['-loop','1','-i',media(image)]
            audio_filters = ['-af','apad']
            timeline=shot.get('dialogueTimeline', [])
            if audio or any(c.get('audio') for c in timeline):
                inputs={}
                def audio_input(item):
                    source=media(item)
                    if source not in inputs:
                        inputs[source]=len(inputs)+1
                        args.extend(['-i',source])
                    return inputs[source]
                if audio:
                    audio_input(audio)
                timed=[]
                for cue in timeline:
                    source=cue.get('audio') or audio
                    if source:
                        timed.append({**cue,'inputIndex':audio_input(source)})
                graph = dubbing_filter(timed, duration)
                if graph:
                    args += ['-filter_complex', graph]
                    audio_map = '[dubbing]'
                    audio_filters = []
                else:
                    audio_map = '1:a:0'
            elif video:
                probe = subprocess.check_output(['ffprobe','-v','error','-select_streams','a','-show_entries','stream=index','-of','csv=p=0',media(video)]).strip()
                if probe:
                    audio_map = '0:a:0'
                else:
                    args += ['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']
                    audio_map = '1:a:0'
            else:
                args += ['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']
                audio_map = '1:a:0'
            out = temp / f'{i:04}.mp4'
            args += ['-map','0:v:0','-map',audio_map,'-vf',f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration={duration}',*audio_filters,'-t',str(duration),'-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2',str(out)]
            run(args)
            clips.append(out)
            print(f'镜头 {i+1}/{len(shots)} 已完成')
        manifest = temp / 'concat.txt'
        manifest.write_text('\n'.join("file '" + p.as_posix() + "'" for p in clips),encoding='utf-8')
        joined = temp / 'joined.mp4'
        run(['-f','concat','-safe','0','-i',str(manifest),'-c','copy',str(joined)])
        output = root / 'output.mp4'
        if project.get('bgm'):
            run(['-i',str(joined),'-stream_loop','-1','-i',media(project['bgm']),'-filter_complex','[1:a]volume=0.2[b];[0:a][b]amix=inputs=2:duration=first:normalize=0[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-movflags','+faststart',str(output)])
        else:
            shutil.copyfile(joined,output)
        print('成片已保存：' + str(output))

if __name__ == '__main__':
    main()
