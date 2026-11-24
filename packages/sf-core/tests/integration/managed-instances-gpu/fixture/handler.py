import glob
import os
import shutil
import subprocess


def handler(event, context):
    """Report the GPU and /tmp that Lambda gives this execution environment."""
    smi = shutil.which("nvidia-smi")
    gpu = None
    if smi:
        gpu = subprocess.run(
            [smi, "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=20,
        ).stdout.strip()
    tmp = os.statvfs("/tmp")
    return {
        "devices": sorted(glob.glob("/dev/nvidia*")),
        "gpu": gpu,
        "tmpMiB": tmp.f_blocks * tmp.f_frsize // 2**20,
    }
