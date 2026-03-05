import os
import sys

def strip_detritus(path):
    for root, dirs, files in os.walk(path):
        for name in dirs + files:
            full_path = os.path.join(root, name)
            try:
                xattrs = os.listxattr(full_path)
                if 'com.apple.FinderInfo' in xattrs:
                    os.removexattr(full_path, 'com.apple.FinderInfo')
                    print(f"Stripped FinderInfo from: {full_path}")
                if 'com.apple.ResourceFork' in xattrs:
                    os.removexattr(full_path, 'com.apple.ResourceFork')
            except Exception as e:
                pass

if __name__ == '__main__':
    strip_detritus(sys.argv[1])
