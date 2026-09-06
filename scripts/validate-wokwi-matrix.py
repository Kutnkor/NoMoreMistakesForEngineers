"""Validate diagrams and compile the selected matrix. CLI paths/config are explicit.
Usage: python3 scripts/validate-wokwi-matrix.py MATRIX_DIR WOKWI_CLI ARDUINO_CLI CONFIG OUTPUT
Requires the libraries in each libraries.txt and the FQBN cores already installed.
"""
import concurrent.futures, json, subprocess, sys, time
from pathlib import Path
root,wokwi,arduino,config,output=map(Path,sys.argv[1:])
matrix=json.loads((root/'matrix.json').read_text())
def validate(case):
    start=time.monotonic()
    lint=subprocess.run([str(wokwi),'lint','--warnings-as-errors',case['path']],capture_output=True,text=True)
    (Path(case['path'])/'wokwi-lint.log').write_text(lint.stdout+lint.stderr)
    compile_result=None
    if case['compile']:
        build=subprocess.run([str(arduino),'compile','--config-file',str(config),'--fqbn',case['fqbn'],'--jobs','2',case['path']],capture_output=True,text=True)
        (Path(case['path'])/'compile.log').write_text(build.stdout+build.stderr)
        compile_result={'passed':build.returncode==0,'exitCode':build.returncode,'output':build.stdout+build.stderr}
    result={k:v for k,v in case.items() if k not in ['path','compile']}
    if compile_result: compile_result['output']=compile_result['output'].replace(str(root.parent),'$WORK')
    result.update(lintPassed=lint.returncode==0,lintOutput=lint.stdout+lint.stderr,compile=compile_result,elapsedSeconds=time.monotonic()-start)
    print(case['name'],'diagram',lint.returncode,'compile',None if compile_result is None else compile_result['exitCode'],flush=True)
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(validate,matrix['cases']))
report={'version':'embedded-validation-1.0','date':'2026-09-05','tools':{'wokwiCLI':'0.26.1','arduinoCLI':'1.5.1','cores':{'arduino:avr':'1.8.8','esp32:esp32':'3.3.11','rp2040:rp2040':'6.1.0'}},'scope':'Diagram lint with official Wokwi CLI, and native Arduino CLI compilation. No cloud simulator execution, physical wiring, or hardware measurements. All supported single module/board pairs plus one combined interactive design per board are linted. All modules on UNO, ESP32 and Pico plus the Nano/Mega combined examples are compiled.','diagrams':{'total':len(results),'passed':sum(r['lintPassed'] for r in results)},'compiles':{'total':sum(r['compile'] is not None for r in results),'passed':sum(r['compile'] is not None and r['compile']['passed'] for r in results)},'rejected':matrix['rejected'],'results':results}
output.write_text(json.dumps(report,indent=2)+'\n')
if report['diagrams']['passed']!=report['diagrams']['total'] or report['compiles']['passed']!=report['compiles']['total']: sys.exit(1)
