from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="ytmp3_next",
    version="1.0.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="YouTube to MP3 Converter",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/ytmp3-next",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires='>=3.7',
    install_requires=[
        'yt-dlp>=2023.3.4',
        'mutagen>=1.45.1',
        'Pillow>=9.0.0',
        'requests>=2.27.1',
    ],
    entry_points={
        'console_scripts': [
            'ytmp3-next=ytmp3_next.main:main',
        ],
    },
)
