$env:Path = "C:\Users\ASUS\miniconda3\envs\tf\Scripts;C:\Users\ASUS\miniconda3\envs\tf\Library\bin;C:\Users\ASUS\miniconda3\envs\tf;$env:Path"
$env:PYTHONIOENCODING = 'utf-8'
Set-Location $PSScriptRoot\backend
python run.py
